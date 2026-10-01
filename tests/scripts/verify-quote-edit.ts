// Integration verification against the configured database. Every write is rolled back.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import PDFDocument from 'pdfkit';
import { itemSalvoParaEntrada } from '@inova/domain';
import { prisma } from '../../apps/api/src/config/prisma.js';
import { criarOrcamento, editarOrcamento, quoteInclude } from '../../apps/api/src/modulos/orcamentos/quote.service.js';
import { createQuoteSchema, editQuoteSchema } from '../../apps/api/src/modulos/orcamentos/quote.schema.js';
import { renderizarPdfOrcamento } from '../../apps/api/src/modulos/orcamentos/quote.pdf.js';
import type { AuthUser } from '../../apps/api/src/compartilhado/http.js';
import { itemSalvoParaRascunho, rascunhoParaEntradaItem } from '../../apps/web/utilitarios/saved-quote.ts';

const rollback = new Error('INOVA_VERIFICATION_ROLLBACK');
try {
  await prisma.$transaction(async (tx) => {
    const admin = await tx.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN' } });
    const customer = await tx.customer.findFirstOrThrow();
    const material = await tx.material.findFirstOrThrow({ where: { isActive: true, billingUnit: 'SQUARE_METER', prices: { some: { validTo: null } } }, include: { prices: { where: { validTo: null }, orderBy: { validFrom: 'desc' }, take: 1 } } });
    const productType = await tx.productType.findFirstOrThrow({ where: { isActive: true } });
    const service = await tx.service.findFirstOrThrow({ where: { isActive: true, billingUnit: 'UNIT' } });
    const edge = await tx.service.findFirstOrThrow({ where: { isActive: true, billingUnit: 'LINEAR_METER', name: { not: 'Saia' } } });
    const user: AuthUser = { id: admin.id, name: admin.name, role: 'SUPER_ADMIN', maxDiscountPercent: 100 };
    const unitPrice = Number(material.prices[0].amount);
    const cutoutPrice = Number(service.currentPrice);
    const input = createQuoteSchema.parse({ customerId: customer.id, discountAmount: 10, items: [{
      projectName: 'Verificação transacional', materialId: material.id, productTypeId: productType.id,
      components: [
        { label: 'Tampo', componentType: 'TOP', orientation: 'HORIZONTAL', lengthMm: 2000, widthMm: 600, quantity: 1, appliedTotal: 987.65,
          edges: [{ serviceId: edge.id, side: 'FRONT', appliedSubtotal: 0 }] },
        { label: 'Lateral', componentType: 'SIDE_LEFT', orientation: 'VERTICAL', lengthMm: 1000, widthMm: 500, quantity: 1 },
      ],
      cutouts: [{ componentIndex: 0, serviceId: service.id, cutoutType: 'SINK', quantity: 1, positionX: 0, positionY: 0, appliedSubtotal: 12.34 }],
      services: [{ serviceId: service.id, billedQuantity: 1, appliedSubtotal: 23.45 }],
    }] });
    let quote = await criarOrcamento(tx, input, user);
    quote = await tx.quote.update({ where: { id: quote.id }, data: { status: 'SENT' }, include: quoteInclude });
    const originalTotal = Number(quote.netTotal);
    for (const item of quote.items) {
      assert.deepEqual(JSON.parse(JSON.stringify(rascunhoParaEntradaItem(itemSalvoParaRascunho(item), item))), JSON.parse(JSON.stringify(itemSalvoParaEntrada(item))), 'O formulário deve reabrir e reenviar todas as medidas, IDs e valores sem modificações');
    }
    const itemId = quote.items[0].id;
    const componentId = quote.items[0].components[0].id;
    assert.equal(Number(quote.items[0].components[0].appliedTotal), 987.65);
    assert.equal(Number(quote.items[0].cutouts[0].unitPriceSnapshot), cutoutPrice);
    await tx.materialPrice.update({ where: { id: material.prices[0].id }, data: { amount: unitPrice + 100 } });
    await tx.service.update({ where: { id: service.id }, data: { currentPrice: cutoutPrice + 100 } });
    const editInput = () => editQuoteSchema.parse({ customerId: customer.id, expectedUpdatedAt: quote.updatedAt.toISOString(), discountAmount: Number(quote.discountAmount), validUntil: quote.validUntil, notes: quote.notes, items: quote.items.map(itemSalvoParaEntrada) });
    quote = await editarOrcamento(tx, quote.id, editInput(), user);
    assert.equal(Number(quote.netTotal), originalTotal, 'Reabrir/salvar deve preservar o valor');
    assert.equal(quote.items[0].id, itemId);
    assert.equal(quote.items[0].components[0].id, componentId, 'Componentes intactos não são recriados');
    const rename = editInput(); rename.items[0].projectName = 'Nome atualizado';
    quote = await editarOrcamento(tx, quote.id, rename, user);
    assert.equal(Number(quote.netTotal), originalTotal);
    assert.equal(quote.items[0].components[0].id, componentId);
    const resized = editInput(); resized.items[0].components[0].lengthMm = 2200;
    resized.items[0].components[1].lengthMm = 1200;
    resized.items[0].cutouts[0].quantity = 2;
    quote = await editarOrcamento(tx, quote.id, resized, user);
    assert.equal(Number(quote.items[0].components[0].appliedTotal), 987.65, 'Medidas não apagam preço manual');
    assert.equal(Number(quote.items[0].unitPriceSnapshot), unitPrice, 'Preço histórico do material');
    assert.equal(Number(quote.items[0].components[1].appliedTotal), Math.round(unitPrice * 0.6 * 100) / 100);
    assert.equal(Number(quote.items[0].cutouts[0].calculatedSubtotal), cutoutPrice * 2, 'Recorte usa seu snapshot');
    assert.equal(Number(quote.items[0].cutouts[0].appliedSubtotal), 12.34);
    assert.equal(Number(quote.items[0].services[0].appliedSubtotal), 23.45);
    assert.equal(Number(quote.netTotal), Math.round((987.65 + unitPrice * 0.6 + 12.34 + 23.45 - 10) * 100) / 100);
    const restored = editInput(); delete restored.items[0].components[0].appliedTotal; delete restored.items[0].cutouts[0].appliedSubtotal;
    quote = await editarOrcamento(tx, quote.id, restored, user);
    assert.equal(quote.items[0].components[0].hasManualPriceOverride, false);
    assert.equal(Number(quote.items[0].components[0].appliedTotal), Math.round(1.32 * unitPrice * 100) / 100, 'Restauração mantém desconto do acabamento');
    assert.equal(Number(quote.items[0].cutouts[0].appliedSubtotal), cutoutPrice * 2);
    const reloaded = await tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude });
    assert.equal(String(reloaded.netTotal), String(quote.netTotal));
    const complement = await criarOrcamento(tx, { ...input, parentQuoteId: quote.id }, user);
    assert.equal(complement.parentQuote?.id, quote.id);
    assert.equal(Number(complement.items[0].unitPriceSnapshot), unitPrice + 100, 'Complemento novo usa preço atual');
    const parent = await tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude });
    assert.equal(parent.complements.length, 1);
    assert.equal(String(parent.netTotal), String(quote.netTotal), 'Vínculo não soma no orçamento original');
    await assert.rejects(() => editarOrcamento(tx, quote.id, { ...editInput(), expectedUpdatedAt: '2000-01-01T00:00:00.000Z' }, user), /outra sessão/);
    const document = new PDFDocument({ margin: 36 });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => { document.on('data', (chunk: Buffer) => chunks.push(chunk)); document.on('end', () => resolve(Buffer.concat(chunks))); document.on('error', reject); });
    renderizarPdfOrcamento(document, reloaded); document.end();
    const pdf = await done;
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    const text = execFileSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
    const total = Number(reloaded.netTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    assert(text.includes(total), 'PDF deve usar exatamente o total salvo');
    assert(!text.includes('987,65') && !text.includes('23,45'), 'PDF não deve expor valores individuais');
    await tx.quote.update({ where: { id: quote.id }, data: { status: 'APPROVED', executionStatus: 'COMPLETED' } });
    await assert.rejects(() => editarOrcamento(tx, quote.id, editInput(), user), /encerrado/);
    console.log('OK: edição, snapshots, medidas, ajustes, desconto global, reabertura, vínculo, conflito, encerrados e PDF real.');
    throw rollback;
  }, { timeout: 60000 });
} catch (error) { if (error !== rollback) throw error; console.log('Transação revertida: nenhum dado de teste foi persistido.'); }
finally { await prisma.$disconnect(); }
