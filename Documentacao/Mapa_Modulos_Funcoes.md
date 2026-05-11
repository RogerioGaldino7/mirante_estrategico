# Mapa de Modulos e Funcoes

Este arquivo e uma referencia rapida para localizar responsabilidades no codigo.
Ele complementa `Guia_Manutencao_Codigo.md`.

## state.js

| Funcao/variavel | Papel |
| --- | --- |
| `globalData` | Array em memoria com registros de faturamento real em formato tidy. |
| `globalMetas` | Array em memoria com metas anuais em formato tidy. |
| `globalOVs` | Array em memoria com ordens de venda processadas. |
| `charts` | Registro de instancias ApexCharts para destruir/recriar graficos. |
| `normalizeCentro(centro)` | Padroniza nomes de centros de custo vindos de bases diferentes. |
| `getCentroSigla(nomeCompleto)` | Retorna sigla curta de um centro, quando conhecida. |
| `showLoading(text, progress)` | Mostra overlay global de carregamento. |
| `updateLoading(text, progress)` | Atualiza texto/progresso do overlay. |
| `hideLoading()` | Esconde overlay global. |
| `yieldUI()` | Cede controle ao navegador para evitar travas em loops longos. |
| `mascararDocumento(docDigits, tipo)` | Mascara CPF e formata CNPJ para exibicao. |
| `chaveCliente(record)` | Gera chave canonica para comparar clientes entre anos. |

## loader.js

| Bloco | Papel |
| --- | --- |
| `csvFileInput` listener | Le bases de faturamento, injeta ano e chama `processData()`. |
| `csvMetaInput` listener | Le metas, injeta ano e chama `processMeData()`. |
| `csvSetorInput` listener | Le CSV de classificacao setorial e chama `processarSetorCsv()`. |
| `csvOVInput` listener | Le OVs e chama `processOVData()`. |
| `setupDevDataLoader()` | Modo auxiliar `?dev=1` para carregar dados via servidor local. |

## data-processor.js

| Funcao | Papel |
| --- | --- |
| `countEmptyLeading(row)` | Mede profundidade da linha hierarquica no CSV do Cubo. |
| `processData(rows)` | Parser principal das bases de faturamento. Popula `globalData`. |
| `renderValidacaoBanner(qtde, valorAfetado)` | Mostra alerta para registros sem documento. |
| `processMeData(rows)` | Parser das metas anuais. Popula `globalMetas`. |

## filters.js

| Funcao | Papel |
| --- | --- |
| `populateFilters()` | Recria filtros da sidebar a partir de `globalData`. |
| `filterClientList(val)` | Filtra visualmente a lista de clientes da sidebar. |
| `getCheckedCentros()` | Retorna centros selecionados ou `"ALL"`. |
| `toggleAllCentros(master)` | Marca/desmarca todos os centros. |
| `updateCentroCheckboxes()` | Atualiza estado do checkbox mestre de centros. |
| `toggleAllMeses(master)` | Marca/desmarca todos os meses. |
| `updateMesCheckboxes()` | Atualiza estado do checkbox mestre de meses. |
| `getCheckedClientes()` | Retorna clientes selecionados ou `"ALL"`. |
| `toggleAllClientes(master)` | Marca/desmarca todos os clientes. |
| `updateClienteCheckboxes()` | Atualiza estado do checkbox mestre de clientes. |
| `getFilteredData()` | Retorna `globalData` com todos os filtros globais aplicados. |
| `getFilteredDataByYear(targetAno)` | Retorna dados de um ano especifico mantendo os demais filtros. |
| `getFilteredMetas()` | Retorna metas filtradas por ano, centro e mes. |

## dashboard.js

| Funcao | Papel |
| --- | --- |
| `updateContextBanner()` | Mostra resumo textual dos filtros ativos. |
| `updateDashboard()` | Orquestra toda a aba Faturamento e chama graficos/tabelas. |

## charts.js

| Funcao | Papel |
| --- | --- |
| `renderChartMensal(data)` | Grafico combinado de faturamento, quantidade e meta. |
| `renderChartFamilia(dataArr)` | Grafico donut de distribuicao por familia. |

## tables.js

| Funcao | Papel |
| --- | --- |
| `groupBySum(arr, key, sumKey)` | Agrupa registros e soma um campo numerico. |
| `renderList(elementId, allItems, nameSingular, namePlural)` | Renderiza Top 15 com total e resumo do restante. |
| `renderMatrix()` | Matriz Real x Meta x Historico x Exec-Plan. |
| `renderMatrixFamilias()` | Matriz mensal por familia com faturado, previsto, realizado e %. |

## ovs.js

| Funcao | Papel |
| --- | --- |
| `_mesLabel(raw)` | Converte `01.Jan` para `Jan`. |
| `_parseNum(str)` | Converte numero pt-BR para `number`. |
| `processOVData(rows)` | Parser de OVs. Popula `globalOVs`. |
| `renderOVSection()` | Filtra e renderiza a secao de OVs. |
| `clearOVSection()` | Limpa tabelas/graficos de OVs. |
| `_renderOVTableStatus(filteredOVs, mesesAtivos)` | Tabela Status x Mes. |
| `_renderOVTableOperacao(filteredOVs, mesesAtivos)` | Tabela Operacao x Mes. |
| `_renderOVChartSituacao(filteredOVs)` | Donut por status. |
| `_renderOVChartTipos(filteredOVs)` | Donut por tipo de operacao. |

## clients.js

| Funcao | Papel |
| --- | --- |
| `renderClientSection()` | Orquestra a aba Inteligencia de Clientes. |
| `_clearClientSection()` | Limpa a aba quando nao ha dados. |
| `_formatCompactCurrency(value)` | Formata valores compactos para eixos. |
| `_renderBrazilMapSection(data)` | Renderiza mapa do Brasil. |
| `_renderClientKPIs(data)` | KPIs de clientes, ticket, Top 10, UFs e cidades. |
| `_renderGeoCharts(data)` | Graficos por UF e cidades. |
| `_renderParetoChart(data)` | Curva Pareto 80/20 de clientes. |
| `_renderSegmentationCharts(data)` | Segmentacao por familia e evolucao mensal. |
| `_renderHeatmapCentroUF(data)` | Heatmap Centro x UF. |
| `_renderClientDetailTable(data)` | Tabela Top 15 clientes detalhada. |

## brazil-map.js

| Funcao/variavel | Papel |
| --- | --- |
| `BR_STATES` | Definicoes SVG simplificadas dos estados brasileiros. |
| `renderBrazilMap(containerId, dataByUF, metric)` | Renderiza mapa coropletico por UF. |
| `_currentMapMetric` | Metrica ativa do mapa: clientes ou valor. |
| `toggleMapMetric(metric)` | Alterna metrica do mapa. |
| `_buildMapData(data)` | Agrega dados por UF para o mapa. |

## fidelidade.js

| Funcao | Papel |
| --- | --- |
| `_initFidelityFilters()` | Inicializa filtros proprios da aba Fidelidade. |
| `_popularAnoBase()` | Popula seletor de ano-base. |
| `_atualizarAvisoGranularidade()` | Mostra aviso para granularidades curtas. |
| `_lerFiltrosFid()` | Le filtros da aba em um objeto. |
| `_ultimoMesId(ano)` | Detecta ultimo mes com dado em um ano. |
| `_intervaloMeses(ano, anos, modo2026)` | Define janela de meses para comparacao. |
| `_faturamentoPorCliente(ano, mesFrom, mesTo, filtroSetor)` | Soma faturamento por cliente respeitando filtros estruturais. |
| `_classificarGruposInstitucionais(faturamentoMap)` | Classifica clientes em 1A, 1B, 2A, 2B, 2C ou EXT. |
| `_definirCoorte(faturamentoBase, filtros)` | Define a coorte conforme Top-N/Todos/Grupos. |
| `_calcularRetencao(filtros, anos)` | Calcula retencao da coorte entre anos. |
| `renderFidelitySection()` | Orquestra toda a aba Fidelidade. |
| `_renderPlaceholders()` | Estado vazio da aba. |
| `_renderKPIs(retencao)` | KPIs de retencao. |
| `_renderCoorteChart(retencao, filtros)` | Grafico de curva de coorte. |
| `_descricaoCoorte(filtros)` | Texto resumido da coorte. |
| `_renderGruposInstitucionais(anos, filtros)` | Tabela de grupos institucionais. |
| `_renderMatrizMigracao(anos, filtros)` | Matriz de migracao entre grupos. |
| `_renderListasAcionaveis(filtros, anos)` | Perdidos, novos campeoes e voltadores. |

## setor.js

| Funcao/variavel | Papel |
| --- | --- |
| `SETOR_OVERRIDES` | Overrides em memoria por CNPJ raiz. |
| `SETOR_STORAGE_KEY` | Chave usada no localStorage. |
| `CNPJ_RAIZ_PUBLICO` | Lista hardcoded inicial de CNPJs publicos. |
| `classificarSetor(record)` | Classificacao detalhada do cliente. |
| `setorPrincipal(record)` | Reduz para PUBLICO, PRIVADO ou EXTERIOR. |
| `carregarOverridesSetoriais()` | Carrega overrides do localStorage. |
| `salvarOverridesSetoriais()` | Salva overrides no localStorage. |
| `limparOverridesSetoriais()` | Remove overrides. |
| `setOverrideSetorial(cnpjRaiz, setor)` | Altera um override pontual. |
| `baixarClassificacaoCsv()` | Exporta classificacao atual em CSV. |
| `processarSetorCsv(rows)` | Importa CSV de overrides setoriais. |
| `estatSetor()` | Diagnostico de distribuicao setorial no console. |

## setor-review.js

| Funcao | Papel |
| --- | --- |
| `renderSetorReview()` | Renderiza a tela de revisao setorial. |
| `changeSetorOverride(selectEl)` | Salva override quando usuario muda um select. |
| `filterSetorReview()` | Busca com debounce na revisao setorial. |

## ai-knowledge.js

| Funcao | Papel |
| --- | --- |
| `exportAIBase()` | Exporta JSON agregado para analise posterior por IA. |

## ai-analytical-export.js

| Funcao | Papel |
| --- | --- |
| `buildAIAnalyticalBase()` | Monta o payload analitico em memoria sem disparar download. |
| `exportAIAnalyticalBase()` | Exporta a base analitica para IA em JSON. |
| `_aiBuildResumoGeral(data, metas, ovs)` | Calcula totais gerais, anos, centros e cobertura geografica. |
| `_aiBuildAnos(data, metas)` | Consolida faturamento, quantidade e metas por ano. |
| `_aiBuildClientes(data, todosAnos, totalGeral)` | Consolida indicadores por cliente, status de carteira, risco e cross-sell. |
| `_aiBuildDimensao(data, keyField, totalGeral)` | Consolida dimensoes como Familia, Centro, UF e Cidade. |
| `_aiBuildSetores(data, totalGeral)` | Consolida analise por PUBLICO, PRIVADO e EXTERIOR. |
| `_aiBuildRankings(clientes, familias, centros, geografia)` | Cria rankings Top 15. |
| `_aiBuildAlertas(clientes, familias, totalGeral)` | Gera sinais de risco e concentracao. |
| `_aiBuildOportunidades(clientes)` | Gera oportunidades iniciais de cross-sell. |
| `_aiBuildPipelineOperacional(ovs, data, metas)` | Cria a camada `pipeline_operacional` com OVs, status, centros, meses e cruzamento com metas/faturamento. |
| `_aiBuildPipelineCruzamento(data, metas, ovs)` | Compara realizado, meta e pipeline aberto por centro e mes. |
| `_aiBuildPipelineAlertas(pipelineResumo, cruzamento)` | Gera alertas de cancelamento, dependencia do pipeline e risco de meta. |
