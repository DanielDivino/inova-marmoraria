import { describe, expect, it } from 'vitest';
import { assinaturaEspaco, assinaturas, conteudoParaServidor, juntarRascunhos, lerDadosServidor, LIMITE_REMOVIDOS } from './rascunho-servidor';

type Espaco = { id: string; activeIndex: number; cliente: string | null };
const espaco = (id: string, cliente: string | null = id, activeIndex = 0): Espaco => ({ id, activeIndex, cliente });
const temDados = (entrada: Espaco) => !!entrada.cliente;

describe('rascunho do Novo orçamento no servidor', () => {
  it('manda só os atendimentos com dados e sem o projeto aberto em cada aparelho', () => {
    const conteudo = JSON.parse(conteudoParaServidor([espaco('a', 'Maria', 2), espaco('vazio', null)], ['x'], temDados));
    expect(conteudo).toEqual({ workspaces: [{ id: 'a', cliente: 'Maria' }], removedWorkspaceIds: ['x'] });
    // Trocar de projeto (ou abrir um atendimento vazio) não muda o que vai ao servidor.
    expect(conteudoParaServidor([espaco('a', 'Maria', 0)], ['x'], temDados)).toBe(conteudoParaServidor([espaco('a', 'Maria', 3), espaco('outro', null)], ['x'], temDados));
    // O salvo (ou apagado) nunca volta ao servidor, mesmo se ainda estiver na tela.
    expect(JSON.parse(conteudoParaServidor([espaco('a', 'Maria'), espaco('salvo', 'João')], ['salvo'], temDados)).workspaces.map((entrada: Espaco) => entrada.id)).toEqual(['a']);
  });

  it('junta os clientes abertos no celular e no computador', () => {
    const computador = { workspaces: [espaco('a', 'Maria'), espaco('b', 'João')], removedWorkspaceIds: [] };
    const celular = { workspaces: [espaco('c', 'Sem cadastro 4'), espaco('vazio', null)], removedWorkspaceIds: [] };
    expect(juntarRascunhos(celular, computador, temDados).workspaces.map((entrada) => entrada.cliente)).toEqual(['Maria', 'João', 'Sem cadastro 4']);
  });

  it('no atendimento que existe nos dois, vale o lado que mudou desde a última versão em comum', () => {
    const base = assinaturas([espaco('a', 'Maria'), espaco('b', 'João')]);
    // Aqui mudou "a"; o outro aparelho mudou "b" e abriu "c".
    const local = { workspaces: [espaco('a', 'Maria (editado aqui)', 2), espaco('b', 'João', 1)], removedWorkspaceIds: [] };
    const servidor = { workspaces: [espaco('a', 'Maria'), espaco('b', 'João (editado lá)'), espaco('c', 'Ana')], removedWorkspaceIds: [] };
    expect(juntarRascunhos(local, servidor, temDados, base).workspaces.map((entrada) => entrada.cliente)).toEqual(['Maria (editado aqui)', 'João (editado lá)', 'Ana']);
    // Os dois mudaram o mesmo atendimento (ou não há versão em comum): vale o deste aparelho.
    const nosDois = { workspaces: [espaco('b', 'João (editado aqui)')], removedWorkspaceIds: [] };
    expect(juntarRascunhos(nosDois, servidor, temDados, base).workspaces.find((entrada) => entrada.id === 'b')?.cliente).toBe('João (editado aqui)');
    expect(juntarRascunhos({ workspaces: [espaco('b', 'João')], removedWorkspaceIds: [] }, servidor, temDados).workspaces.find((entrada) => entrada.id === 'b')?.cliente).toBe('João');
  });

  it('a assinatura não depende da ordem dos campos nem do projeto aberto', () => {
    expect(assinaturaEspaco({ id: 'a', activeIndex: 3, cliente: 'Maria', extra: { y: 1, x: [2, { b: 1, a: 2 }] } })).toBe(assinaturaEspaco({ extra: { x: [2, { a: 2, b: 1 }], y: 1 }, cliente: 'Maria', id: 'a', activeIndex: 0 }));
  });

  it('atendimento salvo ou apagado em um aparelho não volta pelo outro', () => {
    const local = { workspaces: [espaco('a'), espaco('b')], removedWorkspaceIds: ['c'] };
    const servidor = { workspaces: [espaco('b'), espaco('c')], removedWorkspaceIds: ['a'] };
    const juntos = juntarRascunhos(local, servidor, temDados);
    expect(juntos.workspaces.map((entrada) => entrada.id)).toEqual(['b']);
    expect(juntos.removedWorkspaceIds.sort()).toEqual(['a', 'c']);
  });

  it('lembra só os últimos removidos', () => {
    const muitos = Array.from({ length: LIMITE_REMOVIDOS + 20 }, (_, indice) => `r${indice}`);
    expect(JSON.parse(conteudoParaServidor([], muitos, temDados)).removedWorkspaceIds).toHaveLength(LIMITE_REMOVIDOS);
    expect(juntarRascunhos({ workspaces: [], removedWorkspaceIds: muitos }, { workspaces: [], removedWorkspaceIds: [] }, temDados).removedWorkspaceIds).toHaveLength(LIMITE_REMOVIDOS);
  });

  it('ignora dados do servidor fora do formato', () => {
    expect(lerDadosServidor(null)).toEqual({ workspaces: [], removedWorkspaceIds: [] });
    expect(lerDadosServidor({ workspaces: [{ id: 'a' }, { semId: true }, 'x'], removedWorkspaceIds: ['b', 3] })).toEqual({ workspaces: [{ id: 'a' }], removedWorkspaceIds: ['b'] });
  });
});
