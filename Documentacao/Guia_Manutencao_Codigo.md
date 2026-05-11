# Guia de Manutencao do Codigo

Projeto: Mirante Estrategico Tecpar

Este documento foi criado para orientar futuras pessoas que precisem manter,
corrigir ou evoluir o dashboard. Ele descreve a arquitetura atual, o fluxo dos
dados exportados do ERP Benner via Cubo, os principais pontos de extensao e os
cuidados para evitar regressao.

## 1. Visao geral

O Mirante Estrategico Tecpar e um dashboard web estatico. Ele roda diretamente
no navegador, sem backend, sem banco de dados e sem etapa de build. Os dados sao
carregados pelo usuario a partir de arquivos CSV exportados do ERP Benner pela
ferramenta Cubo.

Tecnologias principais:

- HTML, CSS e JavaScript puro.
- PapaParse para leitura dos CSVs.
- ApexCharts para graficos.
- localStorage para guardar overrides de classificacao setorial.

Entrada principal:

- `_Sistema/index.html`

Pastas principais:

- `_Sistema/`: aplicacao web.
- `_Sistema/js/`: modulos JavaScript do dashboard.
- `_Sistema/Imagem/`: logos, favicon e imagens do manual.
- `_Bases_para_Upload/`: exemplos de arquivos CSV para carregar no painel.
- `Documentacao/`: documentos de apoio e manutencao.

## 2. Como abrir o dashboard

O arquivo de atalho na raiz (`🚀_ABRIR_DASHBOARD.html`) aponta para a aplicacao.
Tambem e possivel abrir diretamente:

```text
_Sistema/index.html
```

Quando aberto via `file://`, os uploads manuais funcionam normalmente. O modo de
carregamento automatico de teste em `loader.js` depende de servidor local, pois
o navegador bloqueia `fetch()` de arquivos locais abertos diretamente.

## 3. Fluxo de dados

O fluxo principal e:

1. Usuario exporta bases no ERP Benner via Cubo.
2. Usuario carrega CSVs em `_Sistema/index.html`.
3. `loader.js` usa PapaParse para ler os arquivos.
4. O ano e extraido do nome do arquivo, por exemplo `base_2026.CSV`.
5. `data-processor.js` converte o formato largo/hierarquico do Cubo em formato
   longo/tidy.
6. Os arrays globais sao atualizados em memoria:
   - `globalData`: faturamento real.
   - `globalMetas`: metas anuais.
   - `globalOVs`: ordens de venda.
7. `filters.js` recria os filtros da sidebar.
8. `dashboard.js`, `clients.js`, `fidelidade.js` e `ovs.js` renderizam as abas.

Nao existe persistencia dos dados carregados. Ao recarregar a pagina, o usuario
precisa carregar as bases novamente. A excecao sao os overrides setoriais, que
ficam no `localStorage`.

## 4. Contrato das bases de faturamento

O parser atual espera CSV com ponto e virgula (`;`) e codificacao ISO-8859-1,
com esta estrutura:

```text
Colunas 0..5 : Centro de custo | Familia | Produto | UF | Cidade | Cliente
Coluna 6     : CNPJ ou CPF
Colunas 7..N : pares Valor / Quantidade por mes
Ultima coluna: Ano, injetado pelo loader a partir do nome do arquivo
```

O arquivo precisa ter a coluna `CNPJ ou CPF` na 7a posicao. O parser valida isso
quando encontra o cabecalho `Centro de custo`.

Saida gerada em `globalData`:

```js
{
  Ano: "2026",
  Centro: "CENTRO ...",
  Familia: "...",
  Produto: "...",
  UF: "PR",
  Cidade: "CURITIBA",
  Cliente: "...",
  CNPJ: "00000000000000",
  CNPJRaiz: "00000000",
  TipoDocumento: "CNPJ" | "CPF" | "EXT" | "ND",
  Mes: "Jan",
  Valor: 1234.56,
  Quantidade: 10,
  MesId: 0
}
```

Tipos de documento:

- `CNPJ`: documento com 14 digitos.
- `CPF`: documento com 11 digitos.
- `EXT`: cliente exterior, normalmente UF `EX`, sem CNPJ/CPF brasileiro.
- `ND`: sem documento e sem indicacao de exterior; precisa de atencao.

## 5. Contrato das metas

As metas sao processadas por `processMeData()` em `data-processor.js`.

Estrutura esperada:

```text
Coluna 0: Centro
Coluna 1: Familia/Produto
Colunas seguintes: pares Valor Projetado / Quantidade por mes
Ultima coluna: Ano, injetado pelo loader
```

Saida gerada em `globalMetas`:

```js
{
  Ano: "2026",
  Centro: "CENTRO ...",
  Familia: "...",
  Mes: "Jan",
  MetaValor: 1234.56,
  MetaQtd: 10
}
```

## 6. Contrato das OVs

As Ordens de Venda sao processadas por `processOVData()` em `ovs.js`.

O parser aceita dois formatos de cabecalho:

- Formato A: centros na primeira linha e meses na segunda.
- Formato B: meses na primeira linha e centros na segunda.

O resultado e salvo em `globalOVs`:

```js
{
  Operacao: "2001",
  Status: "Faturada",
  Centro: "CENTRO ...",
  Mes: "Jan",
  Valor: 1234.56
}
```

## 7. Ordem de carregamento dos scripts

A ordem no fim de `_Sistema/index.html` e importante. Alguns modulos dependem de
variaveis e funcoes globais criadas por arquivos anteriores.

Ordem conceitual:

1. `state.js`: estado global e helpers compartilhados.
2. `setor.js`: classificacao setorial.
3. `data-processor.js`: ETL das bases e metas.
4. `filters.js`: filtros e queries filtradas.
5. `charts.js`, `tables.js`: componentes visuais da aba Faturamento.
6. `dashboard.js`: orquestrador da aba Faturamento.
7. `ovs.js`: OVs.
8. `brazil-map.js`, `clients.js`: Inteligencia de Clientes.
9. `fidelidade.js`: coortes, retencao e migracao.
10. `setor-review.js`: revisao manual de setor.
11. `ai-knowledge.js`: exportacao JSON para analise por IA.
12. `loader.js`: listeners dos uploads. Deve ficar por ultimo.

Ao mudar JS ou CSS, atualize o cache-buster no `index.html`, por exemplo:

```html
<script src="js/dashboard.js?v=20260508c"></script>
```

## 8. Modulos principais

### state.js

Mantem o estado global e helpers usados por todos os outros modulos:

- `globalData`, `globalMetas`, `globalOVs`, `charts`.
- `normalizeCentro()`: padroniza nomes de centros.
- `getCentroSigla()`: retorna siglas como CSA, CTM, CMV.
- `showLoading()`, `updateLoading()`, `hideLoading()`: overlay global.
- `yieldUI()`: evita travamento em loops grandes.
- `mascararDocumento()`: exibe CPF mascarado.
- `chaveCliente()`: chave canonica para comparar clientes entre anos.

### loader.js

Registra os eventos dos inputs de arquivo. Ele nao deve conter regra de negocio
pesada; sua funcao e ler CSV, injetar ano e chamar os processadores.

### data-processor.js

E o modulo mais critico do projeto. Ele transforma a exportacao hierarquica do
Cubo em registros longos. Antes de alterar, entenda:

- O mecanismo de `state[]` faz carry-forward da hierarquia.
- `countEmptyLeading()` detecta a profundidade da linha.
- Uma linha vira dado somente quando e considerada folha da hierarquia.
- Linhas-fantasma sem centro sao descartadas e somadas em log.
- Registros `ND` geram banner de validacao.

### filters.js

Recria filtros dinamicamente apos carga de dados. O arquivo foi otimizado para
evitar `innerHTML +=` em loops grandes. Ao mexer aqui, preserve a estrategia:
montar arrays de HTML e aplicar `join('')` uma unica vez.

### dashboard.js

Atualiza a aba Faturamento: KPIs, comparativos contra meta, comparativos YoY,
graficos e tabelas.

### fidelidade.js

Calcula analises de retencao:

- Coorte por ano-base.
- Retencao binaria ou persistencia em Top-N.
- Grupos institucionais 1A, 1B, 2A, 2B, 2C e EXT.
- Matriz de migracao entre anos.
- Listas de perdidos, novos campeoes e voltadores.

Importante: a aba Fidelidade respeita filtros globais de Centro, UF e Cliente,
mas ignora intencionalmente o filtro de Mes para preservar a comparacao de
coortes.

### setor.js

Classifica clientes como publico, privado ou exterior.

Prioridade:

1. Override manual salvo no localStorage.
2. Lista conhecida de CNPJ raiz publico.
3. Tipo de documento `EXT`.
4. Heuristica por nome.
5. Default privado.

### setor-review.js

Interface para revisar classificacao setorial e gravar overrides sem editar CSV.

### clients.js e brazil-map.js

Renderizam a aba Inteligencia de Clientes: KPIs, mapa do Brasil, ranking por UF,
ranking por cidade, Pareto 80/20, segmentacao por familia e heatmap Centro x UF.

### ai-knowledge.js

Exporta um JSON resumido para uso posterior em analise por IA. Trate esse modulo
como auxiliar/experimental. Antes de ampliar, revise os campos de privacidade e
LGPD.

### ai-analytical-export.js

Exporta uma base analitica para IA, sem substituir o export legado. Este modulo
le `globalData`, `globalMetas` e `globalOVs` e gera um JSON com indicadores ja
pre-calculados:

- resumo geral;
- visao por ano;
- visao por centro;
- visao por cliente;
- familias;
- geografia;
- setores;
- rankings;
- alertas;
- oportunidades.
- pipeline_operacional.

E uma funcao somente de leitura. Ela nao altera filtros, graficos, localStorage
ou os arrays globais.

A camada `pipeline_operacional` consolida OVs/propostas por status, mes, centro
e grupo operacional, alem de comparar faturamento realizado, meta e pipeline
aberto por centro/mes. Na exportacao atual de OVs, a granularidade disponivel em
`globalOVs` e agregada por `Operacao`, `Status`, `Centro`, `Mes` e `Valor`.
Portanto, o JSON tambem informa uma lacuna tecnica: cliente, familia, produto,
numero da OV e numero da proposta ainda dependem de uma exportacao mais
detalhada do Benner/Cubo para serem cruzados individualmente.

## 9. Cuidados de manutencao

- Nao introduza backend se o objetivo for manter a ferramenta simples e
  portavel.
- Nao altere o contrato das bases sem atualizar este documento, o manual e os
  alertas do parser.
- Preserve o uso de `yieldUI()` em processamento pesado.
- Ao criar listas grandes na DOM, use array + `join('')`.
- Ao adicionar modulo JS, inclua-o no `index.html` na ordem correta.
- Ao alterar nome de campo em `globalData`, revise todas as abas.
- Ao mexer em CPF, mantenha exibicao mascarada.
- Ao mexer em setor, lembre que overrides ficam no localStorage do navegador do
  usuario.

## 10. Checklist para futuras alteracoes

Antes de entregar uma mudanca:

1. Carregar uma base de faturamento.
2. Conferir se filtros de Ano, Centro, Mes, UF e Cliente foram populados.
3. Conferir KPIs da aba Faturamento.
4. Trocar filtros e validar se graficos/tabelas recalculam.
5. Carregar metas e validar Real x Meta.
6. Carregar OVs, se a mudanca tocar OVs.
7. Abrir Inteligencia de Clientes.
8. Abrir Fidelidade.
9. Abrir Configuracoes/Revisao Setorial.
10. Conferir console do navegador para erros.

## 11. Onde comecar uma manutencao

Para bug de carga de dados:

- Comece em `loader.js` e `data-processor.js`.

Para divergencia de valores:

- Comece em `data-processor.js`, `filters.js`, `dashboard.js` e `tables.js`.

Para filtros que nao atualizam:

- Comece em `filters.js` e veja se `updateDashboard()` e chamado.

Para Fidelidade:

- Comece em `fidelidade.js`, principalmente `_faturamentoPorCliente()`,
  `_definirCoorte()` e `_calcularRetencao()`.

Para Setor/Publico/Privado:

- Comece em `setor.js` e `setor-review.js`.

Para visual:

- Comece em `style.css`, `charts.js`, `tables.js`, `clients.js` ou `ovs.js`.
