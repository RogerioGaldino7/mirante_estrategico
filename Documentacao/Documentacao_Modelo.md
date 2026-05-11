# Documentação do Dashboard de Planejamento

DOCUMENTAÇÃO — Aba "2025 CSA"

Mapeamento do fluxo de trabalho do CSA. As demais abas (CTM, CMV, CERT, HUB, DCQ, CPDI) seguem a mesma estrutura — muda apenas a unidade.


## 1. VISÃO GERAL

A aba 2025 CSA tem SEIS blocos lógicos (não dois, como parecia). Você digita em dois deles (A e D parcialmente); os outros são cálculo automático. As demais abas (CTM, CMV, CERT, HUB, DCQ, CPDI) seguem a mesma estrutura — muda apenas a unidade.


## 2. BLOCO A — DADOS BRUTOS DE SERVIÇOS  (área B2:Z18)

| Localização | O que é |
| --- | --- |
| B5:B17 | Coluna das Famílias de serviço (Soluções Tecnológicas, Águas/Solos, Embalagens, Produtos para Saúde, Fertilizantes, Alimentos e Bebidas, etc.) |
| Linha 3 (C3:Z3) | Cabeçalho dos 12 meses — cada mês ocupa 2 colunas (uma para Faturado, outra para Quantidade) |
| Colunas ímpares (C, E, G … Y) | Valor FATURADO do mês por família (R$) — preenchimento manual |
| Colunas pares (D, F, H … Z) | QUANTIDADE de serviços executados no mês por família — preenchimento manual |
| Linha 18 | Totais mensais (=SUM de cada coluna). C18 = Faturado total de Janeiro, D18 = Qtde total de Janeiro, etc. |
| Linha 18 | Totais mensais (=SUM por coluna). Ex.: C18 = soma do Faturado de Janeiro; D18 = soma das Quantidades de Janeiro |
| 3. BLOCO B — FATURADO vs META  (área AB20:AO30) | Janeiro: Faturado R$ 234.759,93 | Quantidade 331 serviços (único mês preenchido no momento) |
Tabela de conferência: linhas = indicadores, colunas AC:AN = meses (Jan…Dez), coluna AO = Total do ano. Todas as células são FÓRMULA — não digitar aqui.


| Linha (AB) | Rótulo | O que calcula |
| --- | --- | --- |
| 23 | Faturado 2025 | Puxa o total mensal do Bloco A (ex.: AC23 = =C18). É o que de fato faturou no mês. |
| 24 | Meta 2025 (O) | Meta original de 2025 (valor fixo, referencial histórico). |
| 25 | Meta 2026 | Meta do ano seguinte — puxa de PN 2025 (D19, F19, H19…). Só aparece quando já houve faturamento no mês (IF). |
| 26 | Fatur 2025 (O) | Cópia do faturado realizado (valor fixo inserido manualmente para travar histórico). |
| 27 | Faturado 2025 | Mesma lógica condicional: exibe o realizado quando há dado. |
| 28 | Serv (Exec-Plan) | Texto concatenado "Executados - Planejados" (ex.: "331 - 597"). |
| 29 | executados (O) | Qtde de serviços realmente executados no mês (=D18, F18…). |
| 30 | planejados (O) | Qtde de serviços planejada para o mês (valor fixo, vem do PN). |


## 4. LIGAÇÃO COM A ABA PN 2025

A aba PN 2025 (área B2:AA19) guarda a Meta 2026 detalhada por família e mês. Para cada mês há 2 colunas: Valor Projetado e Quantidade. A linha 19 tem os totais mensais, que são justamente o que o Bloco B lê (linha AC25/AD25… → D19/F19… da PN 2025).


## 5. COMO O MÊS NOVO ENTRA

1) Você abre a aba 2025 CSA.  2) No Bloco A, localiza o par de colunas do mês (Faturado/Quantidade) e digita os valores por família.  3) A linha 18 recalcula os totais.  4) O Bloco B (AB20:AO30) lê automaticamente esses totais e compara com a meta da PN 2025.  5) A condicional (IF AC23>1) faz a Meta 2026 só aparecer quando já há realizado, deixando a conferência limpa.


## 10. PONTOS DE ATENÇÃO (observados na leitura real da aba)

• AN24 (Meta 2025 de Dezembro) está VAZIO — as outras 11 estão preenchidas. Confirmar se é intencional.
• CH82/CH83 usam range diferente (B5:Z17 e B5:Z18) dos demais VLOOKUPs do Bloco F (todos em B5:Z17). Bug sutil — pode dar resultado diferente se o dado da linha 18 existir.
• Linhas 82, 83, 84, 87 do Bloco F (PROCESSOS ADM, INFORMACOES, MADEIRAS, SERVIÇOS DIVERSOS) retornam "#VALOR!" ou "Extra" em quase todos os meses porque não estão na tabela PN 2025!C4:AA13 — poluem a visualização.
• BI85 e BM85 retornam #VALOR! (PROCESSOS ADM). Idem para DC/DD/DE na coluna Acumulado — erros propagam.
• Linha 28 "Serv (Exec-Plan)" usa CONCATENATE → vira texto, impede gráfico direto.
• Bloco D/E (top clientes e serviços) só refletem o MÊS ATUAL — se trocar de mês, perde-se o histórico dos meses anteriores.
## 11. IDEIAS PARA O NOVO DASHBOARD

• KPIs topo: Faturado mês | Faturado YTD | Meta YTD | % atingido | Δ vs 2025 | Qtde serviços YTD vs previsto.
• Gráfico 1: barras mensais Faturado por Família + linha de Meta (usa Bloco F).
• Gráfico 2: Qtde executada vs planejada por mês (combo).
• Heatmap Família × Mês de % atingimento (verde>=100%, amarelo 70-100%, vermelho <70%).
• Ranking dinâmico top 10 clientes e top 10 serviços do mês selecionado (com filtro de mês).
• Filtro de Unidade (CSA/CTM/CMV/CERT/HUB/DCQ/CPDI) no topo — um único dashboard serve todas as 7 abas.

## 4. BLOCO C — INDICADORES %  (área AQ31:AW35)

Dois mini-painéis de percentual ao lado do Bloco B. Todos automáticos.

| AQ31:AQ35 | Faturamento / Meta 2026 — Parcial (%) = AO23/AO25 (realizado do mês vs meta do mês). Acumulado 2026 (%) = AO23/AO24 (realizado YTD vs meta ano). |
| --- | --- |
| AU31:AU35 | Faturamento 2026 / 2025 — Parcial (%) = AO23/AO27 (realizado 26 vs realizado 25 do mesmo mês). Acumulado 2025 (%) = AO23/AO26 (YTD 26 vs total 25). |


## 5. BLOCO D — TOP CLIENTES DO MÊS  (área AQ36:BA52)

Ranking manual dos principais clientes do mês. Área rotulada "COLAR AQUI" — você cola a lista do sistema e a coluna AY traz o nome curto via VLOOKUP na aba CLIENTES E SERVIÇOS.

| AQ37:AQ51 | Razão social completa do cliente (colada) — MANUAL |
| --- | --- |
| AR37:AR51 | Valor faturado pelo cliente no mês (R$) — MANUAL |
| AY37:AY51 | Nome curto/apelido — VLOOKUP automático em CLIENTES E SERVIÇOS!B:D |
| AZ37:AZ51 | Espelho do valor (=AR37) — usado para o gráfico/ranking |
| AY52:AZ52 | Totais — AZ52 = SUM(AZ37:AZ51) (soma dos top 15 clientes) |
| AY55:AY58 | Resumo: Faturado total do mês (=AO23) • Top 15 (=AZ52) • Demais clientes (diferença) • Conferência |


## 6. BLOCO E — TOP SERVIÇOS DO MÊS  (área AU54:BC75)

Mesma lógica do Bloco D, mas para serviços (ensaios). Você cola a descrição longa do serviço e o valor; o nome curto vem por VLOOKUP.

| AU55:AU69 | Descrição completa do serviço — MANUAL |
| --- | --- |
| AV55:AV69 | Valor faturado do serviço no mês (R$) — MANUAL |
| BB55:BB69 | Nome curto — VLOOKUP em CLIENTES E SERVIÇOS!G:I |
| BC55:BC70 | Espelho do valor + linha 70 com soma dos top 15 serviços |
| BB73:BB75 / BC73:BC75 | Conferência: Meta anual (BB73=4.380.500) • Faturado top 15 • Demais serviços |


## 7. BLOCO F — PAINEL FAMÍLIA × MÊS  (área BE74:DE89)

O CORAÇÃO analítico da aba. Tabelão 100% automático cruzando as 13 famílias (BE76:BE88) com os 12 meses. Para cada mês, 4 colunas: Faturado (R$), Previsto (#), Realizado (#) e % (Realizado-Previsto)/Previsto.

| BE76:BE89 | Lista fixa das 13 famílias + linha de Totais (linha 89) |
| --- | --- |
| BF:BI (Jan), BJ:BM (Fev)… até CX:DA (Dez) | 4 colunas por mês. Faturado (VLOOKUP em B5:Z17 da própria aba) • Previsto (VLOOKUP em PN 2025!C4:AA13) • Realizado (VLOOKUP em B5:Z17) • % (diferença percentual) |
| DB:DE | Colunas de ACUMULADO ANO — somam os 12 meses. Faturado, Previsto, Realizado e % YTD. |
| Linha 72 | Índices de coluna usados pelos VLOOKUPs (2=Jan-Fat, 3=Jan-Qtd, 4=Fev-Fat, etc). É o que amarra tudo. |


## 8. BLOCO G — HISTÓRICO POR OPERAÇÃO (trimestral)  (área DM92:DT110)

Visualização trimestral/histórica do faturamento por tipo de Operação. Linhas = meses/trimestres desde jan/23; colunas DO…DS = cada Operação (2001 PF, 2002 C/Retenções, 2003 Simples Nacional/Emp. Pública, 2004 Exterior, 9001 Interna) e DT = Total do período. Linha 105 traz o acumulado 2025 por Operação (total R$ 6.423.024,83).


## 9. FLUXO COMPLETO DO MÊS

1º — Bloco A (B2:Z18): digita Faturado e Quantidade por família nas colunas do mês.

2º — Bloco B (AB20:AO30): confere total do mês vs Meta 2026 e Meta 2025 (automático).

3º — Bloco C (AQ31:AW35): olha os % de atingimento (automático).

4º — Bloco D (AQ37:AR51): cola ranking dos top 15 clientes do mês.

5º — Bloco E (AU55:AV69): cola ranking dos top 15 serviços do mês.

6º — Bloco F (BE74:DE89): painel família × mês recalcula sozinho — só conferir.


## 12. BLOCO H — ORDENS DE VENDA POR STATUS  (área DG107:DK113)

Pequena tabela com o total de Ordens de Venda por status (Faturada, Encerrada, Em faturamento, Confirmada, Cancelada, Cadastrada) em 3 datas/meses (colunas DH, DI, DJ). Coluna DK soma os 3. Faturada domínio: ~R$ 5,6 mi no total.


## 13. GRÁFICOS E FORMATAÇÃO VISUAL

Existem 2 gráficos na aba, ambos de PIZZA (Pie):  • "Gráfico 1" — série "OV´s" (alimentado pelo Bloco H de Ordens de Venda)  • "Gráfico 2" — série "Série1"  Ambos estão posicionados lá embaixo/à direita da planilha (próximo às linhas 95-108, colunas DG em diante).

FORMATAÇÃO POR BLOCO (código de cores)

• Bloco A (dados brutos): cabeçalho cinza #7F7F7F, coluna de famílias azul claro #D2E3FA, valores em branco.
• Bloco B (Faturado vs Meta) usa cores por LINHA para separar indicadores:  Faturado = azul #B4C7E7  |  Meta 2025 = laranja #F4B183  |  Fatur 2025 histórico = amarelo #FFD966  |  Serviços Exec/Plan = verde #A9D18E.
• Bloco C (indicadores %): Meta 2026 em azul #8FAADC/#B4C7E7; Meta 2025 em laranja #F4B183/#F8CBAD. Formato 0,00%.
• Bloco D (clientes) e E (serviços): cabeçalho azul forte #4472C4, linhas alternadas #CFD5EA e #E9EBF5, Total em laranja #FFC000.
• Bloco F (família×mês): cabeçalho cinza #E1E1E1, linhas zebradas #F2F2F2 / #D9D9D9, Total amarelo #FFE699.
• Fonte padrão Calibri; Bloco B usa tamanho 15 (ênfase), demais 11-12. Bordas brancas (medium/thick) separam células em blocos com fundo colorido.

## 14. RESUMO PARA O NOVO DASHBOARD

A aba atual mistura ENTRADA de dados + ANÁLISE + VISUALIZAÇÃO no mesmo espaço. Para um dashboard limpo, a recomendação é separar em 3 camadas:

1) ENTRADA — manter o Bloco A como está (você já tem o hábito de alimentar lá).

2) BASE CONSOLIDADA — uma tabela no formato longo (Mês | Unidade | Família | Métrica | Valor) alimentada por fórmula a partir das 7 abas de unidade. Serve de fonte única para gráficos e filtros.

3) DASHBOARD — aba nova com: KPIs no topo (Faturado YTD, % Meta, Δ vs 2024), filtro de Unidade e Mês, gráfico de barras empilhadas por família, heatmap de sazonalidade, ranking Top 15 clientes e Top 15 serviços (já existe a lógica), atingimento por família com semáforo.

Vantagens: um único layout atende as 7 unidades (só muda o filtro), gráficos de PIZZA atuais viram barras/colunas (mais legíveis), e os #VALOR! somem porque o lookup vira dinâmico.


## 15. DADOS BRUTOS DO ERP (abas Faturamento* e OrdemVenda*)

Você exporta 5 tabelas do sistema e cola como estão. Todas vêm no mesmo formato "cruzado" (tabela dinâmica do ERP): meses nas colunas, itens nas linhas, pares Valor+Quantidade por mês, mais uma coluna de Total. Esse formato é ótimo pra LER no papel, mas RUIM pro Excel trabalhar.


| Aba | Tamanho | O que contém |
| --- | --- | --- |
| FaturamentoFamilia | 49 linhas × 28 col | Faturamento por Família de serviço, mês a mês. 13 famílias. É a base que alimenta o Bloco A da aba 2025 CSA. |
| FaturamentoServiço | 554 linhas × 28 col | Faturamento detalhado por Serviço (produto), mês a mês. ~550 serviços distintos. Alimenta o Bloco E (Top 15 Serviços). |
| FaturamentoCliente | 1.512 linhas × 28 col | Faturamento por Cliente, mês a mês. ~1.500 clientes. Alimenta o Bloco D (Top 15 Clientes). |
| OrdemVendaOperação | 19 linhas × 116 col | Ordens de Venda por Operação (2001, 2002…) agrupadas por Proposta (CEB, Certificação…) e mês. |
| OrdemVendaStatus | 11 linhas × 116 col | Ordens de Venda por Status (Faturada, Encerrada, Em faturamento, Confirmada, Cancelada, Cadastrada) por Proposta e mês. Alimenta os 2 gráficos de pizza. |


PROBLEMAS DO FORMATO ATUAL (por isso é difícil trabalhar)

• Cabeçalhos duplicados e inconsistentes: na linha 1 aparece "Valor / Quantidade / Valor2 / Quantidade3…" (numeração automática do ERP). O mês real só aparece na linha 2, e mesmo assim dividido em 2 células mescladas.
• Células mescladas e títulos em linhas 1–4: atrapalham fórmulas, tabelas dinâmicas e gráficos. O Excel não reconhece como "tabela estruturada".
• Formato largo (wide): cada mês é uma coluna. Pra comparar 2 meses ou somar um trimestre você depende de fórmulas manuais. Não dá pra usar SUMIFS/FILTER de forma elegante.
• Mistura Valor + Quantidade lado a lado: dobra o número de colunas (12 meses = 24 colunas) e confunde a leitura.
• Totais já embutidos na exportação (coluna AA/AB, linha "Total por colunas"): se você criar uma tabela dinâmica, o total é contado em dobro.
• Nomes de coluna da OrdemVenda começam em "B = PROPOSTA CEB" e subgrupos de meses embaixo — hierarquia de 2 níveis que o Excel não entende automaticamente.

FORMATO IDEAL (o que recomendo fazer)

Converter tudo para formato LONGO ("tidy data"): uma linha por combinação, sem meses em colunas. Assim:


Exemplo do que seria FaturamentoFamilia no formato ideal:

| Ano | Mês | Centro de Custo | Família | Valor (R$) | Quantidade |
| --- | --- | --- | --- | --- | --- |
| 2025 | Janeiro | CSA | ALIMENTOS E BEBIDAS | 211549.76 | 267 |
| 2025 | Janeiro | CSA | FERTILIZANTES | 24211.98 | 254 |
| 2025 | Fevereiro | CSA | ALIMENTOS E BEBIDAS | 290193.66 | 318 |
| … | … | … | … | … | … |


Vantagens do formato longo:

• Uma única tabela dinâmica resolve TUDO (Top clientes, ranking serviços, família×mês, trimestre, YTD) — basta arrastar os campos.
• Gráficos automaticamente respeitam filtros de mês, unidade e família.
• Ano que vem (2026) é só continuar acrescentando linhas — não precisa mexer em estrutura.
• 7 unidades (CSA/CTM/CMV…) cabem na MESMA tabela (coluna Centro de Custo), eliminando a duplicação de 7 abas idênticas.
• SUMIFS/XLOOKUP/FILTER funcionam direto — sem gambiarra de HLOOKUP/VLOOKUP em ranges fixos.

COMO FAZER A TRANSFORMAÇÃO (2 caminhos)

Caminho A — Power Query (recomendado): Dados > Obter Dados > Da Tabela/Intervalo > Transformar Colunas em Linhas ("Unpivot"). Criação única, atualização automática toda vez que você colar uma nova exportação do ERP. É o caminho profissional.

Caminho B — Fórmula dinâmica (Excel 365): uma fórmula com LET+TOCOL+HSTACK converte a tabela larga em longa em uma aba nova. Mais simples de ler, mas só funciona em Excel 365/2021+.

Posso montar QUALQUER um dos dois pra você — começando por uma das 5 abas como piloto, e se aprovar replico nas outras.

