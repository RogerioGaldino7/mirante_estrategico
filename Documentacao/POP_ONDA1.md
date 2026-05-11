# POP — Mirante Estratégico Tecpar
## Procedimento Operacional Padrão e Continuidade do Desenvolvimento

**Data:** 08/05/2026
**Status:** Onda 1 concluída e validada · Onda 2 e 3 pendentes · 1 issue em aberto

---

## 1. Como retomar em uma nova conversa

Cole este parágrafo no início da próxima conversa (substitua o nome do dashboard se for diferente):

> Estou continuando uma implementação no painel **Mirante Estratégico Tecpar**, dashboard cliente-side em `C:\DashboarPlanejamento\Dashboard_Web`. A **Onda 1** (aba Fidelidade básica + classificação setorial + overlay anti-popup) está concluída e validada. Falta implementar a **Onda 2** (Matriz de Migração 5×5 entre grupos institucionais) e a **Onda 3** (Listas Acionáveis: Perdidos, Novos Campeões, Voltadores). Há **1 issue em aberto**: ao carregar as 4 bases (2023–2026) juntas surgem ~24 registros ND (R$ 156 total), enquanto bases isoladas ficam em 0 ND. Veja o documento `POP_ONDA1.md` na pasta `C:\DashboarPlanejamento` para contexto técnico completo, decisões tomadas e mapa do código.

Após colar isso, peça para o assistente:
- Ler o `POP_ONDA1.md` e o `CLAUDE.md` do projeto.
- Continuar pela Onda 2 (ou pela investigação do issue, se preferir resolver primeiro).

---

## 2. Sobre o projeto

**Nome proposto:** Mirante Estratégico Tecpar (já validado contigo).

**Localização:** `C:\DashboarPlanejamento\Dashboard_Web\`

**Arquitetura:** 100% client-side em HTML + JavaScript + CSS, sem backend, sem build pipeline. Todo o ETL acontece no navegador a partir de uploads CSV.

**Bibliotecas (CDN):** PapaParse 5.4.1 (parsing CSV), ApexCharts (gráficos), Google Fonts (Montserrat / Roboto).

**Bases de dados (workflow):** O usuário exporta do cubo Benner para CSV no formato wide hierárquico, com a coluna `CNPJ ou CPF` na 7ª posição (após Cliente). Os meses começam na coluna 8 como pares Valor/Quantidade.

---

## 3. Implementações concluídas (Onda 1)

### 3.1 Aba "🔁 Fidelidade"

Quarta aba do dashboard, ao lado de Faturamento, Inteligência de Clientes e (implicitamente) OVs. Contém:

- **4 KPIs** — Taxa de Retenção (%), Clientes Retidos (N de M), Valor Retido (R$), Valor Perdido (R$).
- **Curva de Coorte** — line+column chart Apex mostrando % de retenção da carteira ao longo dos anos a partir do ano-base.
- **Visão por Grupo Institucional** — tabela com 1A / 1B / 2A / 2B / 2C / EXT / TOTAL × anos disponíveis, com retenção entre anos consecutivos. Critérios do Plano de Fidelização TECPAR (1A público ≥6%, 1B público <6%, 2A privado >1%, 2B privado 0,1–0,999%, 2C privado <0,1%, EXT exterior).
- **Filtros próprios** — Ano-base (coorte), Tipo de Retenção (binária / persistência no Top-N), Tamanho da Coorte (Top 10/25/50/100/200, Grupos, Todos), Setor (Todos / Público / Privado / Exterior), Granularidade (anual / semestral / trimestral / bimestral / mensal — com aviso para granularidades curtas), Modo Ano Parcial (Mesmo Período / Ano Cheio).

### 3.2 Classificação Setorial

Módulo `js/setor.js` que classifica clientes em PUBLICO_FEDERAL, PUBLICO_ESTADUAL, PUBLICO_MUNICIPAL, PUBLICO_OUTROS, PRIVADO ou EXTERIOR usando três camadas:

1. **Override do usuário** — CSV carregado pelo botão "Classif. Setorial" na navbar, persistido em `localStorage` (chave `tecpar_setor_overrides_v1`). Formato: `CNPJRaiz;Setor;Observacao`.
2. **Lista hardcoded** de raízes CNPJ conhecidas (Min. Saúde, MAPA, Casa Civil PR, FUNDEPAR, ADAPAR, etc.).
3. **Heurística por padrões no nome** (MINISTÉRIO, SECRETARIA, MUNICÍPIO, FUNDAÇÃO, etc.).

Função `setorPrincipal()` reduz para PUBLICO / PRIVADO / EXTERIOR (uso simplificado).

Função `chaveCliente()` em `state.js` retorna chave canônica priorizando CNPJ raiz → CNPJ completo → CPF → nome (com prefixos `G:`, `C:`, `P:`, `E:`, `N:` para distinguir).

### 3.3 Parser robusto (data-processor.js)

- Coluna `CNPJ ou CPF` na 7ª posição (índice 6); meses a partir da 8ª (índice 7).
- Validação inicial: alerta claro se a base estiver no formato antigo (sem coluna CNPJ).
- **Tipo de Documento**: classifica em CNPJ (14 dígitos), CPF (11), EXT (UF=EX) ou ND (sem doc, suspeita).
- **Linhas-fantasma**: registros sem `state[0]` (sem qualquer hierarquia) são **descartadas silenciosamente** e contadas separadamente — são artefatos do cubo sem caminho de drill-down.
- **Reset de estado entre bases**: ao encontrar novo cabeçalho `"Centro de custo"`, zera `state[]` para evitar herança cross-base.
- **Detecção de folha respeita limites de base**: a busca da próxima linha válida para nos cabeçalhos da próxima base e ignora "Total por…".

### 3.4 Parser de OVs (ovs.js)

Auto-detecta dois formatos do cabeçalho hierárquico (centros sparse na linha 0 OU meses sparse na linha 0). Detecção pela presença de `0X.Mes` em cada linha, escolhendo a com mais matches como "sparse com carry-forward".

### 3.5 UX / Performance

- **Loading overlay global**: card central com spinner azul/verde Tecpar, texto principal e linha de progresso, exibido durante TODOS os uploads (Bases / Metas / OVs / Setor).
- **`processData` async com yields** a cada 2.500 linhas — elimina o popup "Página sem resposta" do Chrome/Edge.
- **`populateFilters` otimizado** — array `push` + `join('')` único em vez de `innerHTML +=` em loop. Antes: O(n²), ~10s para 3k clientes. Depois: O(n), <100ms.

### 3.6 Validação visual

- **Banner amarelo no topo da Faturamento** — aparece quando há registros ND (nós colapsados no cubo). Mostra contagem, valor afetado, link para console (F12).
- **`console.table` de diagnóstico** — lista todos os ND com Centro/Família/Produto/UF/Cidade/Cliente/Mês/Valor para o usuário identificar exatamente o que precisa re-expandir no cubo.
- **Resumo de linhas-fantasma descartadas** no console (transparência sobre dados ignorados).

---

## 4. Issue em aberto (não bloqueia o uso)

### 4.1 Sintoma

Ao carregar as 4 bases simultaneamente (Bases 2023, 2024, 2025, 2026) via multi-upload, surgem **24 registros ND** com **R$ 156 totais** (~R$ 6,50/registro).

Quando carregadas individualmente, todas as 4 bases produzem **0 registros ND** (validado pelo usuário).

### 4.2 Hipóteses já testadas (não resolveram)

- **Reset de estado entre bases** — aplicado, não eliminou os 24.
- **Forward search com limite de base** — aplicado, não eliminou os 24.
- **Skip de "Total por…" na detecção de folha** — aplicado, não eliminou os 24.

### 4.3 Próximos passos para diagnosticar

1. Carregar as 4 bases juntas.
2. Abrir o console (F12).
3. Localizar a linha `[Validação] 24 registro(s) sem documento detectado(s)…`.
4. Logo abaixo está o `console.table` com as 24 linhas listadas. **Tirar print disso** ou exportar para texto.
5. Padrão a procurar: todas no mesmo Centro? Em todas as bases ou só em uma específica? Sempre na mesma Família? Em meses específicos? Valores muito padronizados?
6. Hipóteses não exploradas:
   - Existe um cliente que aparece em 2 ou mais bases com cadastro inconsistente (CNPJ presente em umas, ausente em outras)?
   - O carry-forward está deixando passar algum caso de borda específico (talvez quando a primeira linha de uma nova base não é um centro, mas algo sutilmente diferente)?
   - Há alguma linha "fantasma" que tem `state[0]` herdado da base anterior antes do reset entrar em ação?

### 4.4 Mitigação enquanto não resolve

R$ 156 num faturamento de milhões é desprezível para análises agregadas. O banner de validação avisa o usuário, e os 24 registros estão isolados via `TipoDocumento === 'ND'` — não contaminam grupos institucionais (1A-2C) porque a classificação requer setor identificado.

---

## 5. Próximas ondas

### 5.1 Onda 2 — Matriz de Migração 5×5

**Objetivo:** Mostrar a movimentação dos clientes entre grupos institucionais ano a ano.

**Visualização:** Heatmap com 7 linhas × 7 colunas (1A/1B/2A/2B/2C/EXT/SAIU em ano N como linhas, mesmas categorias em ano N+1 como colunas, com a categoria adicional "ENTROU"). Cada célula mostra contagem de clientes E % do total.

**Insight central:** "Dos 4 clientes em 1A em 2024, 3 ficaram em 1A em 2025, 1 caiu para 1B, 0 saiu". "Dos 1071 clientes em 2C em 2024, 850 ficaram em 2C, 30 subiram para 2B, 191 saíram totalmente".

**Onde fica:** Nova seção dentro da aba "🔁 Fidelidade", entre a Curva de Coorte e a tabela de Grupos Institucionais. Provável arquivo: extensão de `js/fidelidade.js`.

**Filtro adicional sugerido:** Seletor "Ano N" e "Ano N+1" — para focar uma transição específica em vez de mostrar todas.

**Cores do heatmap:** verde = retenção alta, amarelo = média, laranja/vermelho = perda, azul = movimentação positiva (subida de grupo).

**Esforço estimado:** ~2-3 horas de trabalho do assistente.

### 5.2 Onda 3 — Listas Acionáveis

Três tabelas no estilo "Top 15 Clientes" da aba Faturamento, todas dentro da aba "🔁 Fidelidade":

**Lista de Perdidos** — clientes que estavam no Top N do ano-base e **não tiveram nenhum faturamento** em ano(s) seguinte(s). Ranqueada pelo valor que faturavam (clique = link para detalhes do cliente, se aplicável).

**Lista de Novos Campeões** — clientes que entraram pela primeira vez no Top N em ano subsequente (não estavam no ano-base). Ranqueada pelo valor de entrada.

**Lista de Voltadores** — clientes que sumiram em algum ano e voltaram em outro. Mostra "anos ausentes" e "valor no retorno".

**Esforço estimado:** ~3-4 horas.

### 5.3 Backlog adicional (post-Onda 3)

- **Tela visual de revisão de Setor** — interface dentro do painel para o usuário marcar clientes "Indefinidos" como Público/Privado clicando, sem editar CSV. Salva no localStorage e oferece download do CSV atualizado.
- **Filtros globais (sidebar) aplicáveis à Fidelidade** — hoje a aba Fidelidade ignora os filtros globais de Centro/UF/Mês. Avaliar se faz sentido respeitá-los.
- **Botão "Baixar classificação setorial atual"** — exporta CSV completo (heurística + overrides) para auditoria e backup.
- **Resolver issue dos 24 ND cross-base** — prioridade conforme dado pelo usuário.
- **Documentação de uso para futuros mantenedores** — guia operacional de como atualizar o painel quando o time de TI mudar.

---

## 6. Estrutura de arquivos atual

```
C:\DashboarPlanejamento\
├── CLAUDE.md                   ← contexto técnico do projeto (não modificar)
├── POP_ONDA1.md                ← ESTE DOCUMENTO
├── Dashboard_Web/
│   ├── index.html              ← layout, abas, scripts
│   ├── style.css               ← design system Tecpar + overlay loading
│   ├── js/
│   │   ├── state.js            ← estado global, helpers UI, chaveCliente, mascararDocumento
│   │   ├── setor.js            ← classificação setorial (NOVO na Onda 1)
│   │   ├── data-processor.js   ← parser de bases (async, com validação de formato e linhas-fantasma)
│   │   ├── filters.js          ← populateFilters (otimizado), getFilteredData
│   │   ├── charts.js           ← gráficos da aba Faturamento
│   │   ├── tables.js           ← tabelas Top 15 e matrizes
│   │   ├── dashboard.js        ← orquestrador da aba Faturamento
│   │   ├── ovs.js              ← parser e render OVs (com auto-detecção de formato)
│   │   ├── brazil-map.js       ← mapa do Brasil
│   │   ├── clients.js          ← aba Inteligência de Clientes
│   │   ├── fidelidade.js       ← aba Fidelidade (NOVO na Onda 1)
│   │   └── loader.js           ← event listeners de upload (com overlay)
│   └── Imagem/
└── (outros: scratch-reader, Repositorio_Bases, etc.)
```

---

## 7. Versões dos arquivos (cache-busters atuais)

```html
<link rel="stylesheet" href="style.css?v=20260506a">
<script src="js/state.js?v=20260506a"></script>
<script src="js/setor.js?v=20260505a"></script>
<script src="js/data-processor.js?v=20260506b"></script>
<script src="js/filters.js?v=20260506a"></script>
<script src="js/charts.js?v=20260423"></script>
<script src="js/tables.js?v=20260423"></script>
<script src="js/dashboard.js?v=20260423"></script>
<script src="js/ovs.js?v=20260505a"></script>
<script src="js/brazil-map.js?v=20260423"></script>
<script src="js/clients.js?v=20260423b"></script>
<script src="js/fidelidade.js?v=20260505a"></script>
<script src="js/loader.js?v=20260506a"></script>
```

Ao modificar qualquer arquivo, **bumpe o cache-buster correspondente** no `index.html` para forçar o navegador a baixar a nova versão.

---

## 8. Decisões importantes já tomadas (não revisitar sem motivo forte)

1. **Sem retrocompatibilidade com formato antigo** — todas as bases devem ser exportadas com a coluna CNPJ/CPF.
2. **Setor = heurística + CSV de override + localStorage** — em vez de hardcoded ou banco. Permite manutenção sem mexer em código.
3. **Wave-by-wave** — entrega incremental para validação contínua.
4. **2026 parcial** — comparação por mesmo período (jan-mai 26 vs jan-mai 25) é o default; usuário pode escolher "ano cheio" no filtro.
5. **CPF mascarado para exibição** — função `mascararDocumento()` mostra `***.***.***-XX`. CPF completo só em memória/cálculo.
6. **EXT (exterior) ≠ ND** — UF=EX gera categoria própria, não erro.
7. **Linhas-fantasma descartadas, não emitidas** — quando `state[0]` está vazio, registro é silenciosamente removido (artefato do cubo sem ação possível).

---

## 9. Comandos úteis no console (F12) para diagnóstico

```javascript
// Distribuição setorial atual
estatSetor()

// Anos disponíveis na base
[...new Set(globalData.map(d => d.Ano))].sort()

// Total de clientes únicos (todas as bases combinadas)
new Set(globalData.map(chaveCliente)).size

// Stats por ano
[...new Set(globalData.map(d => d.Ano))].sort().map(a => ({
    Ano: a,
    Clientes: new Set(globalData.filter(d => d.Ano === a).map(chaveCliente)).size,
    Faturamento: globalData.filter(d => d.Ano === a).reduce((s,d) => s + d.Valor, 0)
}))

// Listar registros sem documento (para investigar issue cross-base)
console.table(globalData.filter(d => d.TipoDocumento === 'ND').map(d => ({
    Centro: d.Centro, Familia: d.Familia, Produto: d.Produto,
    UF: d.UF, Cidade: d.Cidade, Cliente: d.Cliente,
    Mes: d.Mes, Ano: d.Ano, Valor: d.Valor
})))

// Listar registros do exterior (legítimos sem CNPJ)
globalData.filter(d => d.TipoDocumento === 'EXT')

// Ver tudo armazenado em localStorage relacionado ao painel
Object.keys(localStorage).filter(k => k.startsWith('tecpar_'))
```

---

## 10. Como usar / processo de operação

### 10.1 Carregamento padrão

1. Abrir `Dashboard_Web/index.html` no navegador (idealmente Chrome ou Edge).
2. Clicar em **"Carregar Base(s) de Dados"** e selecionar os 4 CSVs (2023, 2024, 2025, 2026 — Ctrl+clique para multi-seleção).
3. Aguardar o overlay de carregamento (vai mostrar progresso). Não fechar a aba durante.
4. **Carregar Metas Anuais** (opcional) — para visões de Real vs Plano.
5. **Carregar OVs** (opcional) — para a seção de Ordens de Venda.
6. **Classif. Setorial** (opcional) — quando houver overrides para corrigir classificação automática. Persistente entre sessões.

### 10.2 Operação rotineira

- Aba **Faturamento** — visão geral de receita, Real vs Plano, Top 15 clientes/produtos, OVs.
- Aba **Inteligência de Clientes** — análise demográfica/geográfica, mapa do Brasil, Pareto 80/20.
- Aba **🔁 Fidelidade** — análise de retenção e migração. Configurar filtros próprios da aba (Ano-base, Top-N, Setor, etc.) e ler os KPIs + curva + tabela de grupos.

### 10.3 Quando aparecer o banner amarelo de "registros sem documento"

1. Abrir F12 → console.
2. Localizar a `console.table` com os registros listados.
3. Identificar Centro/Família afetados.
4. Voltar ao cubo Benner, expandir manualmente o ramo correspondente (ou consultar o suporte da Benner sobre "exportação com todos os níveis").
5. Re-exportar e recarregar.

---

## 11. Referências para o assistente da próxima conversa

- Trabalhar SEMPRE na pasta `C:\DashboarPlanejamento\Dashboard_Web\`.
- Ao modificar JS ou CSS, bumpar o cache-buster no `index.html`.
- Não criar novos backends, frameworks ou builds — manter cliente-side puro.
- Respeitar o design system Tecpar (cores --tecpar-blue/green/orange definidas em `style.css`).
- Para arquivos grandes/novos, preferir criação modular (`js/<nome>.js`) ao invés de inflar arquivos existentes.
- Async + yields em qualquer função que processe arrays grandes (>1000 itens) ou faça muitas operações DOM.
- Documentar em comentários no início do arquivo o propósito e dependências.
- Conversar antes de codar — confirmar decisões de design com o usuário antes da implementação.

---

**Fim do POP_ONDA1.md**

*Bom trabalho na continuação! 🚀*
