import { expect, it } from 'vitest';
import { nomeArquivoPdf, disposicaoArquivoPdf } from './arquivo-pdf.js';

it('preserva acentos no nome e impede caracteres de caminho e controle', () => {
  const nome = nomeArquivoPdf('João / Silva\r\n', 'SET-2026-01');
  expect(nome).toBe('João Silva - SET-2026-01.pdf');
  expect(disposicaoArquivoPdf(nome)).toContain("filename*=UTF-8''Jo%C3%A3o%20Silva");
  expect(disposicaoArquivoPdf(nome)).not.toMatch(/[\r\n]/);
});

it('aceita nomes Unicode e nome de cliente ausente', () => {
  expect(disposicaoArquivoPdf(nomeArquivoPdf('李', 'SET-2026-02'))).toContain('%E6%9D%8E');
  expect(nomeArquivoPdf(null, 'SET-2026-02')).toBe('Cliente - SET-2026-02.pdf');
});
