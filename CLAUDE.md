# CLAUDE.md — Mirante Estratégico Tecpar

Contexto do projeto para assistentes. Leia este arquivo antes de qualquer alteração.
Se precisar de detalhe técnico/histórico, veja também `Documentacao/POP_ONDA1.md`.

**Última atualização:** 2026-07-13

---

## 1. O que é

**Mirante Estratégico Tecpar** é um dashboard analítico de faturamento do Tecpar,
100% **client-side** (HTML + JavaScript + CSS). Não há backend, banco de dados nem
build/compilação. Todo o ETL acontece no navegador a partir de uploads de CSV
exportados do cubo Benner.

**Como abrir:** dar duplo-clique em `🚀_ABRIR_DASHBOARD.html` (redireciona para
`_Sistema/index.html`). Usar Chrome ou Edge. O manual abre por
`📖_MANUAL_USUARIO.html` → `_Sistema/manual.html`.

**Bibliotecas (locais, em `_Sistema/vendor/` desde 2026-07-13):** PapaParse 5.4.1
(parsing CSV), ApexCharts 5.16.0 (gráficos), html2canvas 1.4.1 e jsPDF 2.5.1
(PDFs) — o painel funciona **offline**. Apenas Google Fonts (Montserrat/Roboto)
e o Font Awesome do manual continuam via CDN (degradam graciosamente sem internet).

**Versionamento:** repositório **git local** (branch `main`) desde 2026-07-13.
Os CSVs de dados (clientes) estão no `.gitignore` — nunca versioná-los.
Commitar a cada onda/fix concluído e validado.

---

## 2. Estrutura de pastas

```
C:\Mirante_Estrategico_Tecpar - Atualizar\   ← RAIZ DO PROJETO
├── CLAUDE.md                     ← este arquivo
├── 🚀_ABRIR_DASHBOARD.html       ← atalho → _Sistema/index.html
├── 📖_MANUAL_USUARIO.html        ← atalho → _Sistema/manual.html
├── 🔧_MODO_DEV.bat               ← sobe o servidor local e abre ?dev=1 (dados de teste + prints do manual)
│
├── _Sistema\                     ← A APLICAÇÃO WEB (o código fica aqui)
│   ├── index.html                ← layout, abas, navbar, ordem dos scripts
│   ├── manual.html               ← manual do usuário
│   ├── style.css                 ← design system Tecpar + overlay de loading
│   ├── report-pn.css             ← CSS isolado do Relatório PN (.pn-page)
│   ├── vendor\                   ← bibliotecas locais (PapaParse, ApexCharts, html2canvas, jsPDF)
│   ├── js\                       ← 19 módulos JS (ver seção 4)
│   ├── _legado\                  ← código morto (script.js monolítico antigo — NÃO é carregado)
│   └── Imagem\                   ← logos e prints do manual (manual\*.png)
│
├── _Bases_para_Upload\           ← CSVs de exemplo p/ carregar no painel (via "Carregar Pasta")
│   ├── Faturamento\              ← base_2023..2026.CSV (formato novo desde 2026-07-06)
│   ├── Metas\                    ← meta_2026.CSV
│   └── OrdemVendas\              ← BaseStatusOperacao_2026.CSV
│
├── Repositorio_Bases\            ← bases p/ o modo dev (?dev=1) — base_2025/2026.CSV
├── Repositorio_Metas\            ← meta_2026.CSV (modo dev)
├── Repositorio_Ovs\              ← BaseStatusOperacao_2026.CSV (modo dev)
├── TESTES USUARIO\               ← CSVs de teste ad-hoc do usuário
├── Em analise\                   ← Base2026.CSV em análise
├── Exportacoes_IA\               ← saídas do módulo ai-knowledge
└── Documentacao\
    ├── POP_ONDA1.md              ← contexto técnico completo e histórico
    ├── Documentacao_Modelo.md    ← doc da planilha Excel original (origem do painel)
    ├── Plano_Material_Design_3.md ← proposta de adoção parcial do M3 (não implementada)
    └── Plano de Fidelização dados 2024.pdf
```

> Nota: `POP_ONDA1.md` foi escrito quando o projeto vivia em
> `C:\DashboarPlanejamento\Dashboard_Web\`. Os caminhos mudaram: hoje o código está
> em `_Sistema\`. O conteúdo técnico continua válido; ignore os caminhos antigos.

---

## 3. As abas do painel

- **Faturamento** — receita, Real vs Plano, Top 15 clientes/produtos, Ordens de Venda.
- **Inteligência de Clientes** — demografia/geografia, mapa do Brasil, Pareto 80/20.
- **🔁 Fidelidade** — retenção e migração de carteira. KPIs (taxa de retenção,
  clientes/valor retidos e perdidos), curva de coorte e tabela por grupo
  institucional (1A/1B/2A/2B/2C/EXT), com filtros próprios da aba.
- **Relatório** — construtor de relatório em PDF: seleção de blocos (KPIs, gráficos,
  tabelas, mapa), pré-visualização e download (jsPDF + html2canvas via CDN).
  Reflete os filtros Ano/Centro ativos. Também abriga o Relatório PN.
- **⚙️ Configurações** (nova, 2026-07-12) — auditoria manual de classificações:
  (a) **Classificação de Famílias** Serviço×Produto (`tipo-review.js` — select
  AUTO/Serviço/Produto por família, badge MANUAL/AUTO, busca e filtro);
  (b) **Revisão Setorial** de clientes Público/Privado (`setor-review.js`,
  que morava em outro ponto da UI). Cabeçalho com botões "Exportar Base para
  IA" e "Baixar Classificação (CSV)".

---

## 4. Módulos JavaScript (`_Sistema/js/`)

| Arquivo | Responsabilidade |
| --- | --- |
| `state.js` | estado global, helpers de UI, `chaveCliente()`, `mascararDocumento()`, `normalizeCentro()`, `CENTRO_SIGLAS`/`getCentroSigla()` |
| `setor.js` | classificação setorial (Público/Privado/Exterior): override CSV + hardcoded + heurística; `baixarClassificacaoCsv()` |
| `setor-review.js` | tela de revisão setorial na aba Configurações (marcar cliente Público/Privado sem editar CSV) |
| `tipo-operacao.js` | classificação Serviço/Produto: `classificarTipoOperacao(centro, familia)` — heurística por centro (CVI→Produto, demais→Serviço) + override por família (localStorage `tecpar_tipo_overrides_v1`); `setOverrideTipo()` recalcula globalData e re-renderiza |
| `tipo-review.js` | tabela de revisão de famílias na aba Configurações (select AUTO/Serviço/Produto, busca, filtro, ordenada por faturamento) |
| `data-processor.js` | parser das bases (async, valida formato, descarta linhas-fantasma; filtra `VALID_OPERATIONS`; detecta colunas Operação/Família invertidas) |
| `filters.js` | `populateFilters()` (otimizado), `getFilteredData()`, `getFilteredDataByYear()` |
| `charts.js` | gráficos da aba Faturamento (mensal + donut família) |
| `tables.js` | tabelas Top 15 e matrizes |
| `dashboard.js` | orquestrador da aba Faturamento (`updateDashboard()` também re-renderiza abas visíveis) |
| `ovs.js` | parser e render de Ordens de Venda (auto-detecção de formato) |
| `brazil-map-paths.js` | paths SVG dos estados (`BR_STATES`) — split do antigo brazil-map.js |
| `brazil-map-render.js` | `renderBrazilMap()` — render coroplético (valor/clientes) |
| `clients.js` | aba Inteligência de Clientes (KPIs, geo, Pareto, heatmap Centro×UF, tabela detalhe) |
| `fidelidade.js` | aba Fidelidade: coorte/retenção, Grupos Institucionais, Matriz de Migração 5×5 + drill-down, Listas Acionáveis (Perdidos/Campeões/Voltadores) |
| `ai-knowledge.js` | `exportAIBase()` — exporta base de conhecimento p/ IA (→ `Exportacoes_IA\`) |
| `report.js` | aba Relatório: registro de blocos (`REPORT_BLOCKS`), captura (Apex dataURI / SVG / html2canvas), preview e PDF (jsPDF) |
| `report-pn.js` | Relatório PN (modelo diretoria): PDF A4 paisagem no formato do acompanhamento do PN, dirigido pelos filtros da sidebar (CSS próprio em `report-pn.css`) |
| `loader.js` | event listeners dos uploads (com overlay); upload de **pasta completa** (`folderInput`); modo dev `?dev=1` (carga automática de `Repositorio_*` via http) |
| `dev-shots.js` | utilitário DEV (`?dev=1`): botão "📸 Prints do Manual" regenera os 13 PNGs de `Imagem/manual/` (clone p/ body + Apex dataURI + animações off + rAF por timer; grava via POST `/__save-shot?dir=manual` do static-server) |

> `_Sistema/script.js` (monolito pré-modularização) ficou **órfão** — não era
> referenciado pelo index.html e duplicava funções dos módulos. Movido para
> `_Sistema/_legado/` em 2026-07-13. **Nunca editar nada em `_legado/`.**

### Cache-busters atuais (em `index.html`)

```
style.css?v=20260712d         report-pn.css?v=1.6
state.js?v=20260506a          setor.js?v=20260508b
tipo-operacao.js?v=1.0        tipo-review.js?v=1.0
data-processor.js?v=20260712e filters.js?v=20260706d
charts.js?v=20260712d         tables.js?v=20260712d
dashboard.js?v=20260713a      ovs.js?v=20260505a
brazil-map-paths.js?v=20260712f brazil-map-render.js?v=20260712g
clients.js?v=20260712c        fidelidade.js?v=20260713c
setor-review.js?v=1.3         ai-knowledge.js?v=1.2
loader.js?v=20260713a         report.js?v=1.2
report-pn.js?v=1.9            dev-shots.js?v=1.1
```

**Regra:** ao editar qualquer JS/CSS, **incremente o cache-buster** (`?v=...`) do
arquivo correspondente no `index.html`, senão o navegador serve a versão em cache.

---

## 5. Dados de entrada (CSV do cubo Benner)

Formato *wide* hierárquico: `Centro de custo | Operação de faturamento | Familia |
Produto | UF | CIDADE | Cliente | CNPJ ou CPF | (meses...)`. Coluna `CNPJ ou CPF`
na 8ª posição (índice 7); os meses começam na 9ª coluna (índice 8) como pares
Valor/Quantidade. Tipos de documento: CNPJ (14 díg.), CPF (11), EXT (UF=EX) e ND
(sem documento — suspeito).

> **2026-07-06:** o cubo passou a exportar a coluna `Operação de faturamento` como
> 2ª coluna (antes: `Centro de custo` era seguida direto por `Familia`). Isso
> empurrou `CNPJ ou CPF` da 7ª para a 8ª posição. `data-processor.js` foi
> atualizado para o novo layout (sem retrocompatibilidade — ver convenção #2).
> O valor bruto vai para `OperacaoFaturamento`.

Regras do ETL (`data-processor.js`, estado 2026-07-12):

- **Filtro de operações de venda:** só entram folhas cuja operação começa com
  um código de `VALID_OPERATIONS` (`2001`–`2004`, `3003`). Outras operações
  (entradas, transferências etc.) são **descartadas** do globalData. Linhas com
  operação vazia passam (herança de nó hierárquico).
- **Colunas invertidas:** se `Familia` começa com 4 dígitos e `Operação` não,
  o parser assume que vieram trocadas e as inverte.
- **Família "PRODUTOS" do ERP** é renomeada para "OUTROS SERVIÇOS" para não
  colidir com a classificação Serviço/Produto.
- **`TipoOperacao` (Serviço/Produto)** — desde 2026-07-12 **não é mais** por
  palavra-chave da descrição da operação: é `classificarTipoOperacao(centro,
  familia)` em `tipo-operacao.js` — override manual por Família (localStorage
  `tecpar_tipo_overrides_v1`, editável na aba Configurações) e, sem override,
  heurística por centro (CVI/IMUNOBIOL → Produto; demais → Serviço). O filtro
  da sidebar "Tipo de Operação" (`getCheckedTiposOperacao()` em `filters.js`)
  continua usando esse campo. Não existe mais o valor "Não Classificado".

**Carga de dados (navbar):** o fluxo principal é o botão **"Carregar Pasta"**
(`folderInput`, `webkitdirectory`) — o usuário seleciona `_Bases_para_Upload\`
inteira e o loader separa os arquivos por subpasta (`Faturamento`/`Metas`/
`OrdemVendas`; ano extraído do nome `base_AAAA.CSV`) e aplica `setor.csv` se
presente. Os botões individuais (Base(s), Metas, OVs, Classif. Setorial —
override `tecpar_setor_overrides_v1`, formato `CNPJRaiz;Setor;Observacao`)
**continuam funcionais mas ocultos** (`display:none` na navbar); o CTA do
painel de boas-vindas ainda dispara `#csvFileInput`. Modo dev: abrir via
servidor local com `?dev=1` habilita o botão que carrega `Repositorio_*`
automaticamente (fetch — não funciona em `file://`).

---

## 6. Design tokens (Material 3 — Ondas M0+M1)

`style.css` tem, desde 2026-07-08, uma fundação de *design tokens* seguindo a
arquitetura do Material 3 (ver `Documentacao/Plano_Material_Design_3.md`,
caminho B: M3 como método, Tecpar como marca — sem `@material/web`, sem
dynamic color, sem motion). **As variáveis antigas continuam sendo a fonte da
verdade** (`--tecpar-blue`, `--text-primary`, `--shadow-md`, `--radius-md`...);
os tokens `--ref-*` e `--md-sys-*` são um vocabulário adicional por cima,
usados nas próximas ondas (M2+) e disponíveis para código novo:

- **Referência:** `--ref-{blue,green,orange,error,neutral}-NN` (tons numerados).
- **Sistema:** `--md-sys-color-{primary,secondary,tertiary,error,surface}` +
  `on-*`/`*-container`; `--md-sys-elevation-0..5`; `--md-sys-shape-corner-*`;
  `--md-sys-typescale-*` (usar via `font: var(--md-sys-typescale-title-medium)`);
  `--md-sys-state-{hover,focus,pressed,disabled}-opacity`.
- **Fix de acessibilidade (M0):** `--text-muted` era `#94a3b8` (contraste
  2.56:1 sobre branco — reprovava WCAG AA) → `#687591` (4.62:1, ainda mais
  claro que `--text-secondary` a 4.76:1, hierarquia preservada).
- **M1 (estados/a11y):** `:focus-visible` global (anel 3px, sem duplicar em
  `select`/`.filter-toggle-btn` que já tratavam foco); `:disabled` uniforme
  (opacidade 0.38 via `--md-sys-state-disabled-opacity` — `.report-panel .btn`
  ajustado de .6→.38); alvos de toque ≥44px no mobile (checkbox 16→20px,
  `.checkbox-item`/`.tab-btn` min-height 44px — bloco colocado no
  `@media (max-width:640px)` **existente no fim do arquivo**, não em um novo
  bloco no topo, porque regras de mesma especificidade em ordem de origem
  posterior vencem as anteriores independente de media query).
  Validado no preview: 5 abas visualmente idênticas (exceto o `--text-muted`,
  mudança proposital), regras `:focus-visible` presentes na stylesheet,
  `:disabled` aplicando opacity 0.38, checkbox 20×20 só em viewport 375px.
  **Onda M2 concluída (2026-07-08):** tipografia/elevação/shape aplicadas nos
  principais componentes das 5 abas via `font: var(--md-sys-typescale-*)`
  (shorthand — substitui font-family/size/weight/line-height numa linha só;
  letter-spacing/text-transform continuam declarados à parte, pois o
  shorthand não os inclui) e `box-shadow: var(--md-sys-elevation-*)` /
  `border-radius: var(--md-sys-shape-corner-*)`. Onde o valor ad-hoc já
  batia exatamente com um tom da escala (ex.: `.pbi-card` `--shadow-md` →
  `--md-sys-elevation-2`), a troca é **zero mudança visual** — só passa a
  usar o nome semântico. Onde não batia (`.welcome-title` 26→28px,
  `.drilldown-title` 15→16px), o valor foi **normalizado para o degrau mais
  próximo da escala** — mudança mínima e deliberada, documentada nos
  comentários do CSS (`/* Onda M2 (era Npx, escala usa Mpx) */`).
  **Escopo deliberadamente limitado:** título de aba (`display-small`),
  cabeçalho de card (`title-medium`)/de sidebar (`title-small`), corpo
  (`body-large/medium/small`), labels/chips (`label-*`); um token novo,
  `display-medium` (32px/800), cobre o número "hero" dos KPIs (maior que
  qualquer valor já existente). **Ficou de fora intencionalmente:** internos
  do `.report-sheet` (preview do construtor de PDF MVP — evita revalidar
  html2canvas sem necessidade), tabelas compactas (`.migracao-table`,
  `.drilldown-table`, `#family-matrix-table` — já menores que o menor token
  por design), `.welcome-steps strong/span`/`.welcome-manual-link` (forçar a
  família Montserrat mudaria a fonte de um texto de corpo em Roboto — risco
  não justificado), `.loading-content` (shadow ad-hoc mantido — elemento de
  altíssima frequência, preferi não arriscar variação visual). Achado
  incidental: `.app-title` tem estilo inline pré-existente no `index.html`
  (`font-weight:600`) que já sobrepunha a classe CSS antes desta onda — não
  é regressão, mas fica registrado para uma limpeza futura se o usuário
  quiser. Validado no preview (5 abas, screenshots antes/depois idênticos;
  computed styles conferidos por token). Nota de debugging: resize de
  viewport via CDP em página já carregada pode deixar `getComputedStyle`
  "congelado" na largura anterior para elementos pré-existentes — sempre
  recarregar a página após mudar o tamanho da janela antes de auditar CSS
  responsivo.
  **Pendente/opcional:** M3 (padrões de navbar/sidebar/chips), M4 (tema
  escuro) — condicionadas a decisão do usuário (gate explícito no plano).
- **2026-07-08 (fix visual — `.tab-navigation` sem `position: sticky`):**
  usuário reportou (com print) o título da aba "vazando" por cima da barra
  de abas ao rolar. Primeira tentativa — `background: var(--bg-canvas)` em
  `.main-canvas` (o contêiner de scroll, que tinha padding-top sem fundo
  próprio) — não resolveu sozinha. Investigação extensa no preview isolou a
  causa em `position: sticky` em si: nem fundo opaco (testado até com
  vermelho puro), nem `z-index` alto, nem isolar a barra em camada de
  composição própria (`isolation`, `transform: translateZ(0)`, `contain`),
  nem remover animações dos irmãos (`.tab-content`, `.report-header`)
  resolveram — e o teste decisivo: um elemento `position:fixed` com
  `z-index:99999` criado por script **não conseguiu cobrir o vazamento**,
  o que descarta qualquer causa de CSS/stacking (fisicamente nada deveria
  vencer isso). `position:static` na barra elimina o problema por completo,
  em todas as posições de scroll testadas. Conclusão: provavelmente não é um
  bug de CSS, e sim um artefato de redesenho parcial de tela (comum em
  RDP/VDI/captura remota) — o padrão "região parada sobre fundo em
  movimento" do `sticky` é exatamente o tipo de coisa que confunde
  algoritmos de "atualizar só a região suja". Sticky removido; em seguida o
  usuário pediu para manter a navegação sempre visível sem recriar o bug →
  **layout "app shell"** (solução final): `.main-canvas` virou coluna flex
  **sem scroll próprio** (`overflow:hidden`), com a `.tab-navigation` como
  item fixo do layout e um novo wrapper `.tab-scroll-area` (flex:1;
  min-height:0; overflow-y:auto) envolvendo os `.tab-content` no index.html
  — só ele rola, recortado **abaixo** da barra. Sem sobreposição entre barra
  e conteúdo, o artefato não tem onde aparecer (diferente de sticky/fixed,
  que pintam a barra POR CIMA do conteúdo rolando). Ajustes de acompanhamento:
  `.main-canvas.pre-data` volta a ser block com scroll próprio (painel de
  boas-vindas em telas baixas) e esconde `.tab-scroll-area`; no mobile
  (≤900px, página inteira rola) o shell é desfeito (`display:block`,
  `.tab-scroll-area{overflow:visible}`). Validado no preview: welcome, scroll
  em várias posições/abas (recorte limpo sob a barra, abas sempre visíveis),
  mobile 375px, captura do relatório MVP (5 blocos ok — `_withSourceTabsVisible`
  posiciona as abas relativo ao viewport, fora do clip do wrapper).
  ⚠️ Scripts que rolavam o conteúdo via `.main-canvas.scrollTop` devem usar
  `.tab-scroll-area` (no desktop; no mobile a página rola).

## 7. Status atual

- **Onda 1 — concluída e validada:** aba Fidelidade, classificação setorial,
  parser robusto, overlay de loading, banner de validação de registros ND.
- **2026-07-06:** filtro sidebar "Tipo de Operação" (Produto/Serviço/Não
  Classificado), habilitado pela nova coluna `Operação de faturamento` do
  cubo — afeta Faturamento e Inteligência de Clientes (ambos usam
  `getFilteredData()`); a aba Fidelidade tem filtros próprios e não é afetada.
- **2026-07-06 (fix):** `renderMatrix()` e `renderMatrixFamilias()` (tables.js)
  e o card "Faturamento Ano/Ant." (dashboard.js) tinham filtro de globalData
  **duplicado e desatualizado** (só Centro/UF), ignorando Cliente e Tipo de
  Operação — a tabela "Desempenho Consolidado" não refletia o filtro de
  Serviço/Produto. Trocado por `getFilteredDataByYear()` (filters.js) nos três
  pontos. Ao adicionar um novo filtro na sidebar, sempre integrar em
  `getFilteredData()`/`getFilteredDataByYear()` (filters.js) — nunca duplicar
  `globalData.filter(...)` em outro módulo.
- **2026-07-06 (UX, Onda A):** (a) aviso de substituição no upload de bases —
  `confirm()` em `loader.js` quando já há dados carregados, orientando a seleção
  múltipla (Ctrl+clique) para análise ano-a-ano; (b) botão "Limpar" na sidebar
  (`resetAllFilters()` em `filters.js`) restaura todos os filtros ao padrão;
  (c) status da base sem jargão — "Base: N registros (anos)" com detalhamento
  CNPJ/CPF/EXT/ND movido para tooltip.
- **2026-07-06 (UX, Onda B):** (a) performance de renderização — removidos
  `background-attachment: fixed` do body e os `backdrop-filter` sem efeito
  visual (navbar opaca e sidebar, o layer mais caro da página); (b) filtro de
  clientes com contador "N de M selecionados" (laranja quando parcial) e botão
  "Limpar seleção" (`clearClienteSelection()`/`updateClienteCount()` em
  `filters.js`) — fluxo novo: limpar → buscar → marcar só os desejados.
- **2026-07-06 (UX, Onda C — onboarding):** estado vazio unificado —
  `#welcome-panel` (index.html) exibido enquanto `.main-canvas` tem a classe
  `pre-data`; CSS esconde abas/conteúdo e mostra o painel de boas-vindas (título,
  3 passos, CTA "Carregar Base(s) de Dados" que dispara `#csvFileInput`, link do
  manual e dica de formato). `processData()` (data-processor.js) remove `pre-data`
  ao carregar dados → dashboard aparece. Validado no preview (estado vazio →
  carga → painel some, abas voltam).
- **2026-07-06 (UX, Onda D):** (a) **sidebar colapsável no desktop** — o toggle
  "Ocultar/Mostrar" (`toggle-filters-btn`) agora é visível no desktop (era
  `display:none` fora do mobile) e há um bloco `@media (min-width:641px)` em
  `style.css` que, com `.filters-collapsed`, encolhe a `.filter-pane` de 280px →
  46px (o `.main-canvas` é `flex:1` e ocupa o espaço). Recolhido, o botão vira
  ícone "☰" (JS `setCollapsed()` em index.html). O mobile (≤640px) mantém o
  comportamento full-width anterior — o bloco desktop não o afeta. (b) **indicador
  global de filtro ativo** — selo laranja `#filter-indicator` no cabeçalho da
  sidebar (`window.updateFilterIndicator()` em `filters.js`, chamado no topo de
  `updateDashboard()`): conta filtros fora do padrão (Ano/Centro/Meses/Tipo
  Operação/UF/Clientes), lista-os no tooltip e some quando nada está filtrado.
  Recolhido, aparece compacto como "● N". Complementa o `context-banner` da aba
  Faturamento (que é descritivo e só existe naquela aba). Ambos validados no
  preview.
- **2026-07-06 (revisão dos 15 KPIs):** decisão de negócio tomada — público
  "ambos" (diretoria + operacional) → hierarquizar em vez de remover. Mudanças:
  (a) **Faturamento** — "Volume (Qtd. Executada)" → **Volume Executado** e
  "Ticket Médio Geral" → **Valor Médio por Execução** (cálculo mantido; usuário
  confirmou que Quantidade = ensaios/execuções, logo somar é legítimo);
  "Faturamento/Meta" → **Faturamento vs Meta**, "Faturamento Ano/Ant." →
  **Crescimento vs Ano Anterior** (títulos são setados em runtime em
  `dashboard.js`, não no HTML). (b) Card **Família Líder removido** → virou o
  título do donut "Distribuição por Família" (`renderChartFamilia` em charts.js:
  "Família líder: NOME (N%)"). (c) Card novo **Mix Serviço × Produto** (`kpi-mix`)
  usando `TipoOperacao` — "Serv X% · Prod Y%"; se sobrar %, subtexto mostra "N%
  não classificado" (bases antigas → 100% não classificado). (d) **Clientes** —
  cards "Estados (UFs)" e "Cidades" removidos; a cobertura virou rodapé no
  cabeçalho do mapa (`#cli-cobertura-geo`, "Cobertura: N UFs · M cidades" em
  clients.js); "Ticket Médio" → **Ticket Médio por Cliente**. Validado no preview
  (Faturamento e Clientes). Aba Fidelidade não teve KPIs alterados.
- **2026-07-06 (fix Exportação IA):** `exportAIBase()` (ai-knowledge.js) estava
  **incompleta/incorreta** por referenciar campos inexistentes: (1) `row.CnpjCpf`
  (é `row.CNPJ`) → documento saía sempre vazio e a máscara de CPF nunca disparava;
  (2) `row.Setor` (setor é calculado por `setorPrincipal(row)`/`classificarSetor(row)`
  em setor.js) → todo cliente virava "Privado"; (3) `localStorage['setorOverrides']`
  (chave certa é `tecpar_setor_overrides_v1`, já lida internamente por setor.js).
  Reescrita: privacidade CNPJ completo / CPF mascarado + nome PF anonimizado (hash
  djb2 seguro p/ acentos, não `btoa`); setor via `setorPrincipal`/`classificarSetor`.
  Novas dimensões no JSON: `TipoOperacao` (mix serviço/produto por cliente e
  família), `Quantidade` (por ano), `TipoDocumento`, `Produto` (produtos_consumidos)
  e granularidade **mensal** (`faturamento_por_ano_mes`). `resumo_geral` agora traz
  `faturamento_total`, `mix_operacao_geral` e `distribuicao_setor`. Validado no
  preview: total e mix batem com os KPIs; setor distribui PUBLICO/PRIVADO/EXTERIOR;
  PF sai mascarado/anonimizado.
- **2026-07-06 (Exportação IA por escopo):** `exportAIBase()` passou a respeitar os
  filtros **Ano e Centro** da sidebar (para um centro solicitar a própria base).
  Os demais filtros (UF/Cliente/Mês/Tipo de Operação) são **intencionalmente
  ignorados** — a base de conhecimento deve ser completa dentro do ano/centro.
  O escopo aplicado é gravado em `resumo_geral.escopo_filtro` e refletido no nome
  do arquivo (`Base_Conhecimento_IA_<ano>_<centro>_<data>.json`). Se nada bate no
  filtro, alerta e não baixa. Validado no preview (todos = 6.732 regs; 2025 +
  Centro de Certificação = 738 regs, arquivo com sufixo de escopo).
- **Onda 2 — concluída (2026-07-06):** Matriz de Migração Institucional 5×5 na aba
  Fidelidade (`_renderMatrizMigracao()` em `fidelidade.js`). Seletores próprios
  **Ano N / Ano N+1**, linhas de origem (1A/1B/2A/2B/2C/EXT + `ENTROU`) × colunas
  de destino (mesmos grupos + `SAIU`), com contagem e % por célula e total por
  origem. Células coloridas por fluxo (`subiu`/`caiu`/`igual`/`saiu`/`entrou` via
  `rank` dos grupos → classes CSS `.migracao-celula-*`). **Drill-down clicável**
  (`window._exibirDrillDownClientes()`): abre card com a lista cliente-a-cliente
  daquele fluxo — faturamento Ano N vs N+1, delta absoluto e %, documento
  mascarado (convenção #6) — com `window.exportarDrillDownCsv()` (CSV BOM UTF-8).
- **Onda 3 — concluída (2026-07-06):** Listas Acionáveis (`_renderListasAcionaveis()`):
  **Perdidos (Churn)**, **Novos Campeões** e **Voltadores** (esta usa histórico
  pré-ano-base para distinguir resgate de cliente novo). Top 15 na tela, cada
  lista com export CSV próprio (`window.exportarListaAcionavel(tipo)`, caches
  `_cachePerdidos/_cacheCampeoes/_cacheVoltadores`). Matriz, drill-down e listas
  reaproveitam `_faturamentoPorCliente()`/`_intervaloMeses()` e respeitam os
  filtros globais (Centro/UF/Cliente) + setor e o modo "mesmo período" de 2026.
  > Nota de leitura de negócio: Perdidos/Campeões dependem da **coorte**, que
  > respeita o filtro **Top-N** — com Top-N pequeno refletem entrada/saída *do
  > Top-N*, não do universo total. A Matriz de Migração, por outro lado, classifica
  > o universo completo do ano. Exports de CSV gravam o documento **completo**
  > (não mascarado) — consistente com o export do drill-down e do ai-knowledge.
- **2026-07-07 (aba Relatório — concluída):** construtor de relatório PDF
  (`report.js`, aba "Relatório" no index.html). MVP com 5 blocos (`REPORT_BLOCKS`):
  KPIs Faturamento, donut Família, Top 15 clientes, KPIs Clientes e Mapa do Brasil.
  Captura via `_capturarBlocos()` → `_withSourceTabsVisible()` (torna as abas de
  origem visíveis fora da tela e re-renderiza — ApexCharts/html2canvas não capturam
  containers com `display:none`). Fixes da retomada: (1) removidas chamadas à
  função inexistente `_refreshFontes()` (quebrava preview e PDF com ReferenceError)
  — preview e PDF agora usam `_capturarBlocos()`, que estava órfã; (2) PDF
  reencoda as capturas como JPEG q0.88 sobre fundo branco (`_toJpeg()`) — o PNG
  scale 2 embutido gerava PDF de ~35 MB; caiu para ~0,6 MB. Validado no preview
  (base 2026: 5 blocos capturados, PDF 2 páginas, sem erros no console).
  Escopo do relatório = filtros Ano/Centro/UF da sidebar (texto em `_escopoTexto()`).
- **2026-07-07 (Relatório PN — Ondas R1+R2 concluídas):** réplica em PDF do
  relatório PowerPoint/Excel da diretoria ("Acompanhamento PN", modelo em
  `Documentacao/` não versionado — 6 págs analisadas de um PDF do usuário).
  `report-pn.js` + `report-pn.css` (CSS isolado, seletores sob `.pn-page`),
  botões próprios na aba Relatório. A4 **paisagem**, dirigido pelos filtros da
  sidebar (Ano = ano-base; Meses = colunas das tabelas e meta "do período";
  Centro = escopo). 3 páginas consolidadas: (1) tabelas SERVIÇOS/PRODUTOS/GERAL
  (Faturado/Meta/Ano ant./Qtd Exec–Plan × meses) + 3 velocímetros radialBar;
  (2) barras Faturado×Meta×Ant por centro + colunas % da meta; (3) Top 15
  clientes e serviços com "E mais N… somaram R$X". **Decisões:** págs. 2-3 são
  Serviços-only (fiel ao modelo — vacinas/produtos distorcem escala e são
  acompanhadas na pág. 1 e futuramente na capa); metas classificadas
  Serviço/Produto por família via tipo dominante no faturamento
  (`_pnMapaTipoFamilia`) + heurística "VACINA"→Produto. Pipeline: páginas DOM
  offscreen 1123×794 → ApexCharts→dataURI→`<img>` → html2canvas scale 2 →
  JPEG q0.9 → jsPDF 'l' full-bleed. Validado no preview (2025+2026+metas,
  Jan–Mar: 3 págs, PDF ~1 MB, números batem com o modelo real — Fev serviços
  60.738,34 e produtos 14.200.000 idênticos).
  **Onda R4 concluída (2026-07-07) — capa narrativa:** 1ª página do PDF com
  título central, 3 seções de destaques (título + bullets, uma linha do
  textarea = um bullet), gráfico Meta × Faturado por mês (tipo em foco) e
  velocímetro do contrato de vacinas (faturado ÷ valor total, dados manuais).
  Campos editáveis em `<details>` "📝 Capa: destaques e contrato" no bloco
  Relatório PN (3 títulos + 3 textos + nº/valor/faturado do contrato),
  persistidos em localStorage `tecpar_pn_capa_v1` p/ reuso mensal
  (`_pnCapaInit/_pnCapaConfig` em report-pn.js). Capa entra no
  `_pnFingerprint` (mudou texto → recaptura). Sem contrato preenchido o
  velocímetro é omitido; sem textos, placeholder discreto. Relatório completo
  agora tem 24 págs. Validado no preview (capa CSA Jan–Mar: bullets, gráfico
  e gauge 35,7% = 14,2M/39,76M; persistência confirmada após reload).
  Relatório PN completo: R1–R4 entregues.
  **Onda R3 concluída (2026-07-07):** dupla de páginas de detalhe por centro
  com movimento no escopo (`_pnCentrosDetalhe`/`_pnDadosCentro`): (a) "Resumo"
  — tabela mensal do centro, blocos % (Faturamento/Meta período+anual;
  2026/2025 com variação), Top 15 clientes e serviços próprios; (b) "Famílias
  e Ordens de Venda" — famílias × (Fat/Prev#/Real#/% no mês-ref e acumulado,
  flags "Novo"=fora do plano anual / "Extra"=sem previsto no período, cap 11 +
  "Outras"), OVs por Situação × mês e por Operação × mês (usa `globalOVs` e
  `OV_OPERACAO_LABELS` de ovs.js; seção omitida com nota se OVs não
  carregadas). Relatório completo (todos os centros): 23 págs, ~55s de
  captura, PDF ~7 MB. Preview/PDF/apresentação compartilham cache de capturas
  (`_pnObterShots()` + `_pnFingerprint`) — gerar PDF após preview leva <1s.
  Validado no preview (CSA vs modelo real: Top 15 e OVs idênticos — "E mais
  100 clientes R$ 146.413,50", OV 2001 7.504,00, 2002 285.698,55; meta CSA ==
  faturado 2025 é dado real da base, não bug).
  > Dev: `.claude/static-server.js` tem endpoint POST `/__save-shot` (grava
  > imagem base64 em `.claude/preview-shots/`) p/ validação automatizada
  > quando o screenshot do preview não responde.
  **Caixas Serviços/Produtos** no bloco
  do Relatório PN (`_pnTiposSelecionados()`): controlam quais seções entram —
  só um tipo marcado omite a tabela do outro e a GERAL (redundante), adapta
  velocímetros, títulos e o foco das págs. 2-3 (`tipoFoco`), e sufixa o nome do
  arquivo (`_servicos`/`_produtos`). Centros só de serviços dispensam as seções
  de produtos. **Modo apresentação** (`apresentarPN()`): botão "▶️ Apresentar
  (tela cheia)" abre as páginas capturadas como slides em fullscreen
  (Fullscreen API, com fallback overlay) — navegação por setas/clique/Esc,
  clique no último slide encerra; reusa o cache do preview quando os filtros
  não mudaram (`_pnFingerprint`), senão recaptura. O overlay nasce no gesto do
  clique para o `requestFullscreen` não ser bloqueado. **Divergência a validar
  com o usuário:**
  meta de serviços do trimestre deu R$ 3,28M aqui vs R$ 2,12M no modelo
  (classificação por família difere do critério manual do Excel).
- **Issue resolvido (2026-07-06):** os ~24 registros ND que surgiam ao carregar as
  4 bases juntas desapareceram após a re-exportação das bases 2023–2025 no novo
  formato (com coluna `Operação de faturamento`): 17.075 registros, 0 ND.
  Histórico do diagnóstico na seção 4 do `POP_ONDA1.md`.
- **2026-07-12 (onda de atualizações — feita fora deste fluxo de assistente):**
  (a) **aba Configurações** (`tab-config`) com a nova revisão de famílias
  Serviço×Produto (`tipo-operacao.js` + `tipo-review.js`) e a Revisão Setorial
  movida para lá; botões Exportar IA / Baixar Classificação no cabeçalho.
  (b) **Reclassificação de `TipoOperacao`**: por centro+família com override
  manual (ver seção 5) — substituiu a classificação por palavra-chave da
  operação. (c) **ETL**: filtro `VALID_OPERATIONS` (só vendas 2001–2004/3003),
  detecção de colunas invertidas, família "PRODUTOS"→"OUTROS SERVIÇOS".
  (d) **Upload de pasta completa** na navbar (botões individuais ocultos) +
  modo dev `?dev=1` (pastas `Repositorio_*`). (e) `brazil-map.js` dividido em
  `brazil-map-paths.js`/`brazil-map-render.js`. (f) `CENTRO_SIGLAS`/
  `normalizeCentro` centralizados em `state.js`.
- **2026-07-13 (auditoria pós-atualização — fixes):** (1) **crash na aba
  Fidelidade** — `_renderGruposInstitucionais()` (fidelidade.js:520) tinha um
  refactor pela metade: gravava em `porAno[ano]` (variáveis inexistentes; o
  certo é `porPeriodo[p.label]`, que o corpo da tabela consome) e mantinha um
  bloco morto da versão antiga que remontava o cabeçalho com `anos`/`head`
  (também inexistentes). O ReferenceError quebrava `renderFidelitySection()`
  inteira e **deixava o overlay de loading preso** ao fim de `processData()`
  (o `hideLoading()` da linha final nunca rodava). Corrigido e validado no
  preview (KPIs, coorte, matriz, grupos e listas ok; overlay fecha).
  (2) o upload de pasta coletava `setor.csv` mas **nunca o processava** —
  agora chama `processarSetorCsv()` antes do faturamento (loader.js);
  (3) `updateDashboard()` só re-renderizava a Revisão Setorial quando a aba
  Configurações estava aberta — agora também chama `renderTipoReview()`
  (dashboard.js); (4) `script.js` órfão (monolito antigo, 950 linhas duplicando
  módulos) movido para `_Sistema/_legado/`; (5) CLAUDE.md sincronizado com o
  código (seções 2–5, 7, 9).
- **2026-07-13 (prints do manual + utilitário):** auditoria achou os 12 prints
  do manual **defasados** (KPIs antigos, sidebar sem Tipo de Operação, navbar
  antiga, Configurações sem painel de Famílias) e 2 imagens órfãs. Todos
  regenerados a partir da UI atual + novo `cap6_relatorio_1.png`. O pipeline
  virou utilitário permanente: **`js/dev-shots.js`** (botão "📸 Prints do
  Manual" no modo dev) + endpoint `?dir=manual` no `.claude/static-server.js`
  + atalho **`🔧_MODO_DEV.bat`** na raiz (duplo-clique: sobe servidor + abre
  `?dev=1`). Rotina pós-onda: carregar dados de teste → 📸 → conferir →
  commitar. Armadilhas documentadas no cabeçalho do dev-shots.js (animação
  fadeUp congela em opacity:0 com documento oculto; Apex precisa de rAF;
  html2canvas não vê dentro do scroll da aba — clonar p/ body).
- **2026-07-13 (infraestrutura — pendências resolvidas):** (1) **git local**
  inicializado (branch `main`, baseline commitado; dados de clientes fora via
  `.gitignore`); (2) **libs vendorizadas** em `_Sistema/vendor/` — PapaParse
  5.4.1, ApexCharts 5.16.0 (mesma versão que o CDN não-pinado servia),
  html2canvas 1.4.1, jsPDF 2.5.1 — o painel agora funciona **sem internet**;
  validado no preview (carga, gráficos, captura do relatório MVP com 5 blocos,
  zero erros); (3) **manual.html atualizado** — cap. 1 reescrito para o fluxo
  "Importar Pasta de Bases" (print da navbar regenerado), filtro Tipo de
  Operação e botão Limpar no cap. 2, novo cap. 6 "Aba Relatório"
  (blocos + Relatório PN + modo apresentação) e cap. 7 "Configurações"
  expandido (aviso de que overrides ficam no localStorage do navegador —
  backup via CSV).

---

## 8. Convenções (não revisitar sem motivo forte)

1. **Manter 100% client-side** — sem backend, framework ou build.
2. **Sem retrocompatibilidade** com o formato antigo de CSV (todas as bases devem ter coluna CNPJ/CPF).
3. **Setor = heurística + override CSV + localStorage** (não hardcode nem banco).
4. **Entrega wave-by-wave**, com validação a cada etapa.
5. **2026 é ano parcial** — comparação por mesmo período é o default.
6. **CPF mascarado na exibição** (`***.***.***-XX`); completo só em memória.
7. **EXT (exterior) ≠ ND** — UF=EX é categoria legítima, não erro.
8. Respeitar o design system Tecpar (variáveis `--tecpar-blue/green/orange` em `style.css`).
9. Funções que processam arrays grandes (>1000 itens) ou muito DOM devem ser **async com yields**.
10. **Conversar antes de codar** — confirmar decisões de design com o usuário antes de implementar.

---

## 9. Diagnóstico rápido no console (F12)

```javascript
estatSetor()                                             // distribuição setorial
[...new Set(globalData.map(d => d.Ano))].sort()          // anos carregados
new Set(globalData.map(chaveCliente)).size               // clientes únicos
console.table(globalData.filter(d => d.TipoDocumento === 'ND'))  // registros ND
Object.keys(localStorage).filter(k => k.startsWith('tecpar_'))   // dados persistidos
TIPO_OVERRIDES                                           // overrides Serviço/Produto ativos
globalData.reduce((a,d)=>(a[d.TipoOperacao]=(a[d.TipoOperacao]||0)+d.Valor,a),{})  // mix S/P
```
