// =============================================================================
// ai-analytical-export.js - Exportacao analitica para uso com IA
// =============================================================================
// Depende de: state.js (globalData, globalMetas, globalOVs, formatter,
//             chaveCliente, mascararDocumento)
//             setor.js (classificarSetor, setorPrincipal)
//
// Este modulo cria um JSON mais rico que o export legado de ai-knowledge.js.
// Ele e somente leitura: nao altera filtros, graficos, localStorage ou dados
// globais. A saida ja inclui sinais analiticos para apoiar perguntas de IA.
// =============================================================================

const AI_ANALYTICS_VERSION = '1.1.0';
const AI_MONTHS_ORDER = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function _aiRound(value, digits = 2) {
    const n = Number(value) || 0;
    const factor = Math.pow(10, digits);
    return Math.round(n * factor) / factor;
}

function _aiPercent(part, total, digits = 2) {
    if (!total) return 0;
    return _aiRound((part / total) * 100, digits);
}

function _aiHash(text) {
    const str = String(text || '');
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
}

function _aiClienteId(record) {
    if (!record) return 'CLIENTE_ND';
    if (record.TipoDocumento === 'CPF') return 'PF_' + _aiHash(record.CNPJ || record.Cliente);
    if (record.CNPJRaiz) return 'CNPJRAIZ_' + record.CNPJRaiz;
    if (typeof chaveCliente === 'function') return 'CHAVE_' + _aiHash(chaveCliente(record));
    return 'CLIENTE_' + _aiHash(record.Cliente);
}

function _aiDocumentoSeguro(record) {
    if (!record || !record.CNPJ) return '';
    if (record.TipoDocumento === 'CPF') {
        return typeof mascararDocumento === 'function'
            ? mascararDocumento(record.CNPJ, 'CPF')
            : '***.***.***-' + String(record.CNPJ).slice(-2);
    }
    if (record.TipoDocumento === 'CNPJ') {
        return typeof mascararDocumento === 'function'
            ? mascararDocumento(record.CNPJ, 'CNPJ')
            : record.CNPJ;
    }
    return '';
}

function _aiSetAdd(target, key, value) {
    if (!target[key]) target[key] = new Set();
    if (value) target[key].add(value);
}

function _aiObjFromSetMap(obj) {
    const out = {};
    Object.keys(obj).forEach(k => { out[k] = Array.from(obj[k]).sort(); });
    return out;
}

function _aiDownloadJson(payload, filenamePrefix) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function _aiBuildResumoGeral(data, metas, ovs) {
    const anos = Array.from(new Set(data.map(d => d.Ano))).filter(Boolean).sort();
    const centros = Array.from(new Set(data.map(d => d.Centro))).filter(Boolean).sort();
    const clientes = new Set();
    const familias = new Set();
    const ufs = new Set();
    const cidades = new Set();
    let faturamentoTotal = 0;
    let quantidadeTotal = 0;

    data.forEach(d => {
        clientes.add(_aiClienteId(d));
        if (d.Familia) familias.add(d.Familia);
        if (d.UF && d.UF !== 'ND') ufs.add(d.UF);
        if (d.Cidade && !String(d.Cidade).includes('NAO DEFINIDO') && !String(d.Cidade).includes('NÃO DEFINIDO')) cidades.add(d.Cidade);
        faturamentoTotal += Number(d.Valor) || 0;
        quantidadeTotal += Number(d.Quantidade) || 0;
    });

    return {
        total_registros_faturamento: data.length,
        total_registros_metas: metas.length,
        total_registros_ovs: ovs.length,
        anos_disponiveis: anos,
        centros_custo: centros,
        total_clientes_unicos: clientes.size,
        total_familias: familias.size,
        total_ufs: ufs.size,
        total_cidades: cidades.size,
        faturamento_total: _aiRound(faturamentoTotal),
        quantidade_total: _aiRound(quantidadeTotal),
        ticket_medio_por_cliente: clientes.size ? _aiRound(faturamentoTotal / clientes.size) : 0
    };
}

function _aiBuildAnos(data, metas) {
    const anos = {};
    data.forEach(d => {
        const ano = d.Ano || 'SEM_ANO';
        if (!anos[ano]) {
            anos[ano] = {
                faturamento: 0,
                quantidade: 0,
                clientes: new Set(),
                centros: new Set(),
                familias: new Set(),
                meses_com_dados: new Set(),
                meta_valor: 0,
                meta_quantidade: 0
            };
        }
        anos[ano].faturamento += Number(d.Valor) || 0;
        anos[ano].quantidade += Number(d.Quantidade) || 0;
        anos[ano].clientes.add(_aiClienteId(d));
        if (d.Centro) anos[ano].centros.add(d.Centro);
        if (d.Familia) anos[ano].familias.add(d.Familia);
        if (d.Mes) anos[ano].meses_com_dados.add(d.Mes);
    });

    metas.forEach(m => {
        const ano = m.Ano || 'SEM_ANO';
        if (!anos[ano]) {
            anos[ano] = {
                faturamento: 0,
                quantidade: 0,
                clientes: new Set(),
                centros: new Set(),
                familias: new Set(),
                meses_com_dados: new Set(),
                meta_valor: 0,
                meta_quantidade: 0
            };
        }
        anos[ano].meta_valor += Number(m.MetaValor) || 0;
        anos[ano].meta_quantidade += Number(m.MetaQtd) || 0;
    });

    const out = {};
    Object.keys(anos).sort().forEach(ano => {
        const a = anos[ano];
        out[ano] = {
            faturamento: _aiRound(a.faturamento),
            quantidade: _aiRound(a.quantidade),
            meta_valor: _aiRound(a.meta_valor),
            meta_quantidade: _aiRound(a.meta_quantidade),
            atingimento_meta_percentual: _aiPercent(a.faturamento, a.meta_valor),
            clientes_unicos: a.clientes.size,
            centros_ativos: Array.from(a.centros).sort(),
            familias_ativas: Array.from(a.familias).sort(),
            meses_com_dados: Array.from(a.meses_com_dados).sort((x, y) => AI_MONTHS_ORDER.indexOf(x) - AI_MONTHS_ORDER.indexOf(y))
        };
    });
    return out;
}

function _aiClassificarStatusCliente(anosAtivos, todosAnos) {
    if (anosAtivos.length === 0) return 'sem_faturamento';
    const primeiroAnoGlobal = todosAnos[0];
    const ultimoAnoGlobal = todosAnos[todosAnos.length - 1];
    const primeiro = anosAtivos[0];
    const ultimo = anosAtivos[anosAtivos.length - 1];

    if (primeiro === ultimoAnoGlobal && anosAtivos.length === 1) return 'novo';
    if (ultimo !== ultimoAnoGlobal) return 'perdido';
    if (primeiro !== primeiroAnoGlobal && anosAtivos.length === 1) return 'novo_no_periodo';

    let teveLacuna = false;
    for (let i = 1; i < anosAtivos.length; i++) {
        const prevIdx = todosAnos.indexOf(anosAtivos[i - 1]);
        const currIdx = todosAnos.indexOf(anosAtivos[i]);
        if (currIdx - prevIdx > 1) teveLacuna = true;
    }
    if (teveLacuna && ultimo === ultimoAnoGlobal) return 'voltador';
    return anosAtivos.length > 1 ? 'recorrente' : 'pontual';
}

function _aiBuildClientes(data, todosAnos, totalGeral) {
    const clientes = {};
    const familiasSet = {};
    const centrosSet = {};

    data.forEach(d => {
        const id = _aiClienteId(d);
        if (!clientes[id]) {
            const setorDetalhado = typeof classificarSetor === 'function' ? classificarSetor(d) : '';
            const setorAgrupado = typeof setorPrincipal === 'function' ? setorPrincipal(d) : '';
            clientes[id] = {
                id,
                nome: d.TipoDocumento === 'CPF' ? 'Pessoa Fisica Mascarada' : (d.Cliente || 'Cliente nao identificado'),
                documento_tipo: d.TipoDocumento || 'ND',
                documento_mascarado: _aiDocumentoSeguro(d),
                cnpj_raiz: d.TipoDocumento === 'CNPJ' ? (d.CNPJRaiz || '') : '',
                uf: d.UF || '',
                cidade: d.Cidade || '',
                setor_detalhado: setorDetalhado,
                setor_principal: setorAgrupado,
                faturamento_total: 0,
                quantidade_total: 0,
                faturamento_por_ano: {},
                quantidade_por_ano: {},
                faturamento_por_mes: {},
                variacao_yoy_percentual: {},
                participacao_total_percentual: 0,
                familias_consumidas: [],
                centros_consumidos: [],
                primeiro_ano_faturamento: '',
                ultimo_ano_faturamento: '',
                anos_ativos: [],
                status_carteira: '',
                risco_churn: 'baixo',
                oportunidade_cross_sell: false
            };
            familiasSet[id] = new Set();
            centrosSet[id] = new Set();
        }

        const c = clientes[id];
        const ano = d.Ano || 'SEM_ANO';
        const mes = d.Mes || 'SEM_MES';
        const valor = Number(d.Valor) || 0;
        const quantidade = Number(d.Quantidade) || 0;
        c.faturamento_total += valor;
        c.quantidade_total += quantidade;
        c.faturamento_por_ano[ano] = (c.faturamento_por_ano[ano] || 0) + valor;
        c.quantidade_por_ano[ano] = (c.quantidade_por_ano[ano] || 0) + quantidade;
        c.faturamento_por_mes[mes] = (c.faturamento_por_mes[mes] || 0) + valor;
        if (d.Familia) familiasSet[id].add(d.Familia);
        if (d.Centro) centrosSet[id].add(d.Centro);
    });

    Object.keys(clientes).forEach(id => {
        const c = clientes[id];
        const anosAtivos = Object.keys(c.faturamento_por_ano).filter(a => c.faturamento_por_ano[a] > 0).sort();
        c.anos_ativos = anosAtivos;
        c.primeiro_ano_faturamento = anosAtivos[0] || '';
        c.ultimo_ano_faturamento = anosAtivos[anosAtivos.length - 1] || '';
        c.status_carteira = _aiClassificarStatusCliente(anosAtivos, todosAnos);
        c.familias_consumidas = Array.from(familiasSet[id]).sort();
        c.centros_consumidos = Array.from(centrosSet[id]).sort();
        c.oportunidade_cross_sell = c.familias_consumidas.length === 1 && c.faturamento_total > 0;
        c.participacao_total_percentual = _aiPercent(c.faturamento_total, totalGeral);

        for (let i = 1; i < todosAnos.length; i++) {
            const ano = todosAnos[i];
            const anoAnt = todosAnos[i - 1];
            const atual = c.faturamento_por_ano[ano] || 0;
            const anterior = c.faturamento_por_ano[anoAnt] || 0;
            if (anterior > 0) {
                c.variacao_yoy_percentual[ano] = _aiRound(((atual / anterior) - 1) * 100);
            } else if (atual > 0) {
                c.variacao_yoy_percentual[ano] = null;
            }
        }

        const ultimoAno = todosAnos[todosAnos.length - 1];
        const penultimoAno = todosAnos[todosAnos.length - 2];
        const fatUltimo = c.faturamento_por_ano[ultimoAno] || 0;
        const fatPenultimo = c.faturamento_por_ano[penultimoAno] || 0;
        if (c.status_carteira === 'perdido') c.risco_churn = 'alto';
        else if (fatPenultimo > 0 && fatUltimo === 0) c.risco_churn = 'alto';
        else if (fatPenultimo > 0 && fatUltimo / fatPenultimo < 0.5) c.risco_churn = 'medio';

        c.faturamento_total = _aiRound(c.faturamento_total);
        c.quantidade_total = _aiRound(c.quantidade_total);
        Object.keys(c.faturamento_por_ano).forEach(a => { c.faturamento_por_ano[a] = _aiRound(c.faturamento_por_ano[a]); });
        Object.keys(c.quantidade_por_ano).forEach(a => { c.quantidade_por_ano[a] = _aiRound(c.quantidade_por_ano[a]); });
        Object.keys(c.faturamento_por_mes).forEach(m => { c.faturamento_por_mes[m] = _aiRound(c.faturamento_por_mes[m]); });
    });

    return clientes;
}

function _aiBuildDimensao(data, keyField, totalGeral) {
    const map = {};
    const clientes = {};
    const anos = {};
    data.forEach(d => {
        const key = d[keyField] || 'NAO_IDENTIFICADO';
        if (!map[key]) {
            map[key] = {
                nome: key,
                faturamento_total: 0,
                quantidade_total: 0,
                clientes_unicos: 0,
                faturamento_por_ano: {},
                participacao_total_percentual: 0
            };
            clientes[key] = new Set();
            anos[key] = {};
        }
        map[key].faturamento_total += Number(d.Valor) || 0;
        map[key].quantidade_total += Number(d.Quantidade) || 0;
        map[key].faturamento_por_ano[d.Ano] = (map[key].faturamento_por_ano[d.Ano] || 0) + (Number(d.Valor) || 0);
        clientes[key].add(_aiClienteId(d));
        _aiSetAdd(anos[key], d.Ano, d.Mes);
    });

    Object.keys(map).forEach(key => {
        map[key].faturamento_total = _aiRound(map[key].faturamento_total);
        map[key].quantidade_total = _aiRound(map[key].quantidade_total);
        map[key].clientes_unicos = clientes[key].size;
        map[key].participacao_total_percentual = _aiPercent(map[key].faturamento_total, totalGeral);
        Object.keys(map[key].faturamento_por_ano).forEach(a => {
            map[key].faturamento_por_ano[a] = _aiRound(map[key].faturamento_por_ano[a]);
        });
        map[key].meses_por_ano = _aiObjFromSetMap(anos[key]);
    });
    return map;
}

function _aiBuildSetores(data, totalGeral) {
    const map = {};
    data.forEach(d => {
        const key = typeof setorPrincipal === 'function' ? setorPrincipal(d) : 'NAO_CLASSIFICADO';
        if (!map[key]) {
            map[key] = {
                setor: key,
                faturamento_total: 0,
                quantidade_total: 0,
                clientes: new Set(),
                faturamento_por_ano: {},
                familias: new Set()
            };
        }
        map[key].faturamento_total += Number(d.Valor) || 0;
        map[key].quantidade_total += Number(d.Quantidade) || 0;
        map[key].clientes.add(_aiClienteId(d));
        map[key].faturamento_por_ano[d.Ano] = (map[key].faturamento_por_ano[d.Ano] || 0) + (Number(d.Valor) || 0);
        if (d.Familia) map[key].familias.add(d.Familia);
    });

    const out = {};
    Object.keys(map).sort().forEach(key => {
        out[key] = {
            faturamento_total: _aiRound(map[key].faturamento_total),
            quantidade_total: _aiRound(map[key].quantidade_total),
            clientes_unicos: map[key].clientes.size,
            participacao_total_percentual: _aiPercent(map[key].faturamento_total, totalGeral),
            faturamento_por_ano: {},
            familias: Array.from(map[key].familias).sort()
        };
        Object.keys(map[key].faturamento_por_ano).sort().forEach(a => {
            out[key].faturamento_por_ano[a] = _aiRound(map[key].faturamento_por_ano[a]);
        });
    });
    return out;
}

function _aiBuildRankings(clientes, familias, centros, geografia) {
    const topFromObj = (obj, labelField = 'nome') => Object.values(obj)
        .sort((a, b) => (b.faturamento_total || 0) - (a.faturamento_total || 0))
        .slice(0, 15)
        .map((item, idx) => ({
            rank: idx + 1,
            nome: item[labelField] || item.nome || item.id,
            faturamento_total: item.faturamento_total,
            participacao_total_percentual: item.participacao_total_percentual
        }));

    return {
        top_clientes: topFromObj(clientes, 'nome'),
        top_familias: topFromObj(familias, 'nome'),
        top_centros: topFromObj(centros, 'nome'),
        top_ufs: topFromObj(geografia.ufs || {}, 'nome')
    };
}

function _aiBuildAlertas(clientes, familias, totalGeral) {
    const alertas = [];
    Object.values(clientes).forEach(c => {
        if (c.risco_churn === 'alto' && c.participacao_total_percentual >= 1) {
            alertas.push({
                tipo: 'risco_churn_cliente_relevante',
                severidade: 'alta',
                cliente_id: c.id,
                cliente: c.nome,
                participacao_total_percentual: c.participacao_total_percentual,
                ultimo_ano_faturamento: c.ultimo_ano_faturamento,
                mensagem: 'Cliente relevante sem faturamento no ano mais recente ou perdido no periodo.'
            });
        }
        if (c.risco_churn === 'medio' && c.participacao_total_percentual >= 1) {
            alertas.push({
                tipo: 'queda_cliente_relevante',
                severidade: 'media',
                cliente_id: c.id,
                cliente: c.nome,
                mensagem: 'Cliente relevante com queda forte no ano mais recente.'
            });
        }
    });

    Object.values(familias).forEach(f => {
        if (f.participacao_total_percentual >= 20 && f.clientes_unicos <= 5) {
            alertas.push({
                tipo: 'concentracao_familia',
                severidade: 'media',
                familia: f.nome,
                clientes_unicos: f.clientes_unicos,
                participacao_total_percentual: f.participacao_total_percentual,
                mensagem: 'Familia com alta participacao e poucos clientes unicos.'
            });
        }
    });

    return alertas.sort((a, b) => {
        const peso = { alta: 3, media: 2, baixa: 1 };
        return (peso[b.severidade] || 0) - (peso[a.severidade] || 0);
    });
}

function _aiBuildOportunidades(clientes) {
    return Object.values(clientes)
        .filter(c => c.oportunidade_cross_sell && c.faturamento_total > 0 && c.status_carteira !== 'perdido')
        .sort((a, b) => b.faturamento_total - a.faturamento_total)
        .slice(0, 30)
        .map(c => ({
            tipo: 'cross_sell',
            cliente_id: c.id,
            cliente: c.nome,
            familia_atual: c.familias_consumidas[0] || '',
            faturamento_total: c.faturamento_total,
            mensagem: 'Cliente ativo consome apenas uma familia; pode haver oportunidade de ampliacao de relacionamento.'
        }));
}

function _aiOvOperacaoLabel(operacao) {
    if (typeof OV_OPERACAO_LABELS !== 'undefined' && OV_OPERACAO_LABELS[operacao]) {
        return OV_OPERACAO_LABELS[operacao];
    }
    return operacao || 'NAO_IDENTIFICADO';
}

function _aiOvStatusGrupo(status) {
    const s = String(status || '').toUpperCase();
    if (s.includes('FATURADA')) return 'realizado_ov';
    if (s.includes('EM FATURAMENTO')) return 'pipeline_em_faturamento';
    if (s.includes('CONFIRMADA')) return 'pipeline_confirmado';
    if (s.includes('CADASTRADA')) return 'pipeline_cadastrado';
    if (s.includes('CANCELADA')) return 'perda_cancelamento';
    if (s.includes('ENCERRADA')) return 'encerrado';
    return 'outros';
}

function _aiBuildOvDimension(ovs, keyField) {
    const map = {};
    ovs.forEach(ov => {
        const key = ov[keyField] || 'NAO_IDENTIFICADO';
        if (!map[key]) {
            map[key] = {
                nome: key,
                valor_total: 0,
                total_registros: 0,
                por_status: {},
                por_mes: {},
                por_centro: {}
            };
        }
        const valor = Number(ov.Valor) || 0;
        map[key].valor_total += valor;
        map[key].total_registros++;
        map[key].por_status[ov.Status || 'NAO_IDENTIFICADO'] = (map[key].por_status[ov.Status || 'NAO_IDENTIFICADO'] || 0) + valor;
        map[key].por_mes[ov.Mes || 'SEM_MES'] = (map[key].por_mes[ov.Mes || 'SEM_MES'] || 0) + valor;
        map[key].por_centro[ov.Centro || 'NAO_IDENTIFICADO'] = (map[key].por_centro[ov.Centro || 'NAO_IDENTIFICADO'] || 0) + valor;
    });

    Object.keys(map).forEach(key => {
        map[key].valor_total = _aiRound(map[key].valor_total);
        Object.keys(map[key].por_status).forEach(k => { map[key].por_status[k] = _aiRound(map[key].por_status[k]); });
        Object.keys(map[key].por_mes).forEach(k => { map[key].por_mes[k] = _aiRound(map[key].por_mes[k]); });
        Object.keys(map[key].por_centro).forEach(k => { map[key].por_centro[k] = _aiRound(map[key].por_centro[k]); });
    });
    return map;
}

function _aiBuildPipelineCruzamento(data, metas, ovs) {
    const map = {};
    const ensure = (centro, mes) => {
        const key = `${centro || 'NAO_IDENTIFICADO'}||${mes || 'SEM_MES'}`;
        if (!map[key]) {
            map[key] = {
                centro: centro || 'NAO_IDENTIFICADO',
                mes: mes || 'SEM_MES',
                faturamento_realizado: 0,
                meta_valor: 0,
                pipeline_confirmado: 0,
                pipeline_em_faturamento: 0,
                pipeline_cadastrado: 0,
                pipeline_cancelado: 0,
                potencial_com_pipeline: 0,
                atingimento_realizado_percentual: 0,
                atingimento_potencial_percentual: 0
            };
        }
        return map[key];
    };

    data.forEach(d => {
        const item = ensure(d.Centro, d.Mes);
        item.faturamento_realizado += Number(d.Valor) || 0;
    });

    metas.forEach(m => {
        const item = ensure(m.Centro, m.Mes);
        item.meta_valor += Number(m.MetaValor) || 0;
    });

    ovs.forEach(ov => {
        const item = ensure(ov.Centro, ov.Mes);
        const valor = Number(ov.Valor) || 0;
        const grupo = _aiOvStatusGrupo(ov.Status);
        if (grupo === 'pipeline_confirmado') item.pipeline_confirmado += valor;
        else if (grupo === 'pipeline_em_faturamento') item.pipeline_em_faturamento += valor;
        else if (grupo === 'pipeline_cadastrado') item.pipeline_cadastrado += valor;
        else if (grupo === 'perda_cancelamento') item.pipeline_cancelado += valor;
    });

    return Object.values(map).map(item => {
        const pipelineAberto = item.pipeline_confirmado + item.pipeline_em_faturamento + item.pipeline_cadastrado;
        item.potencial_com_pipeline = item.faturamento_realizado + pipelineAberto;
        item.atingimento_realizado_percentual = _aiPercent(item.faturamento_realizado, item.meta_valor);
        item.atingimento_potencial_percentual = _aiPercent(item.potencial_com_pipeline, item.meta_valor);

        [
            'faturamento_realizado', 'meta_valor', 'pipeline_confirmado',
            'pipeline_em_faturamento', 'pipeline_cadastrado',
            'pipeline_cancelado', 'potencial_com_pipeline'
        ].forEach(k => { item[k] = _aiRound(item[k]); });
        return item;
    }).sort((a, b) => {
        const c = String(a.centro).localeCompare(String(b.centro));
        if (c !== 0) return c;
        return AI_MONTHS_ORDER.indexOf(a.mes) - AI_MONTHS_ORDER.indexOf(b.mes);
    });
}

function _aiBuildPipelineAlertas(pipelineResumo, cruzamento) {
    const alertas = [];
    Object.values(pipelineResumo.por_centro || {}).forEach(centro => {
        const cancelado = centro.por_status?.Cancelada || centro.por_status?.CANCELADA || 0;
        if (cancelado > 0 && cancelado / Math.max(centro.valor_total, 1) >= 0.2) {
            alertas.push({
                tipo: 'cancelamento_relevante_centro',
                severidade: 'media',
                centro: centro.nome,
                valor_cancelado: _aiRound(cancelado),
                percentual_cancelado: _aiPercent(cancelado, centro.valor_total),
                mensagem: 'Centro com percentual relevante de OVs canceladas no pipeline.'
            });
        }
    });

    cruzamento.forEach(item => {
        if (item.meta_valor > 0 && item.atingimento_realizado_percentual < 70 && item.atingimento_potencial_percentual >= 100) {
            alertas.push({
                tipo: 'meta_dependente_pipeline',
                severidade: 'media',
                centro: item.centro,
                mes: item.mes,
                atingimento_realizado_percentual: item.atingimento_realizado_percentual,
                atingimento_potencial_percentual: item.atingimento_potencial_percentual,
                mensagem: 'Meta pode ser atingida se o pipeline aberto converter em faturamento.'
            });
        }
        if (item.meta_valor > 0 && item.atingimento_potencial_percentual < 70) {
            alertas.push({
                tipo: 'risco_nao_atingimento_meta',
                severidade: 'alta',
                centro: item.centro,
                mes: item.mes,
                atingimento_potencial_percentual: item.atingimento_potencial_percentual,
                mensagem: 'Mesmo somando pipeline aberto, o potencial esta abaixo de 70% da meta.'
            });
        }
    });

    return alertas;
}

function _aiBuildPipelineOperacional(ovs, data, metas) {
    const total = ovs.reduce((sum, ov) => sum + (Number(ov.Valor) || 0), 0);
    const porStatus = _aiBuildOvDimension(ovs, 'Status');
    const porMes = _aiBuildOvDimension(ovs, 'Mes');
    const porCentro = _aiBuildOvDimension(ovs, 'Centro');
    const porOperacao = _aiBuildOvDimension(ovs, 'Operacao');
    const hasFamilia = ovs.some(ov => ov.Familia);
    const hasCliente = ovs.some(ov => ov.Cliente);
    const porFamilia = hasFamilia ? _aiBuildOvDimension(ovs, 'Familia') : {};
    const porCliente = hasCliente ? _aiBuildOvDimension(ovs, 'Cliente') : {};
    const porGrupoStatus = {};

    ovs.forEach(ov => {
        const grupo = _aiOvStatusGrupo(ov.Status);
        if (!porGrupoStatus[grupo]) {
            porGrupoStatus[grupo] = { valor_total: 0, total_registros: 0, status_origem: new Set() };
        }
        porGrupoStatus[grupo].valor_total += Number(ov.Valor) || 0;
        porGrupoStatus[grupo].total_registros++;
        if (ov.Status) porGrupoStatus[grupo].status_origem.add(ov.Status);
    });

    Object.keys(porGrupoStatus).forEach(k => {
        porGrupoStatus[k].valor_total = _aiRound(porGrupoStatus[k].valor_total);
        porGrupoStatus[k].status_origem = Array.from(porGrupoStatus[k].status_origem).sort();
    });

    Object.keys(porOperacao).forEach(op => {
        porOperacao[op].grupo_operacional = op;
        porOperacao[op].descricao_operacao = _aiOvOperacaoLabel(op);
    });

    const cruzamento = _aiBuildPipelineCruzamento(data, metas, ovs);
    const registros = ovs.map((ov, idx) => ({
        id_registro_pipeline: `OV_AGREGADA_${String(idx + 1).padStart(6, '0')}`,
        detalhamento: 'registro_agregado_do_cubo',
        operacao: ov.Operacao || '',
        descricao_operacao: _aiOvOperacaoLabel(ov.Operacao),
        status: ov.Status || '',
        grupo_status: _aiOvStatusGrupo(ov.Status),
        centro: ov.Centro || '',
        familia: ov.Familia || '',
        cliente: ov.Cliente || '',
        numero_ov: ov.NumeroOV || ov.OV || '',
        numero_proposta: ov.NumeroProposta || ov.Proposta || '',
        mes: ov.Mes || '',
        valor: _aiRound(ov.Valor)
    }));

    const pipelineAberto =
        (porGrupoStatus.pipeline_confirmado?.valor_total || 0) +
        (porGrupoStatus.pipeline_em_faturamento?.valor_total || 0) +
        (porGrupoStatus.pipeline_cadastrado?.valor_total || 0);

    const pipeline = {
        resumo: {
            total_registros_ovs: ovs.length,
            valor_total_ovs: _aiRound(total),
            valor_pipeline_aberto: _aiRound(pipelineAberto),
            valor_ovs_faturadas: _aiRound(porGrupoStatus.realizado_ov?.valor_total || 0),
            valor_cancelado: _aiRound(porGrupoStatus.perda_cancelamento?.valor_total || 0),
            observacao: 'A granularidade atual de globalOVs e agregada por operacao, status, centro e mes.'
        },
        por_status: porStatus,
        por_grupo_status: porGrupoStatus,
        por_mes: porMes,
        por_centro: porCentro,
        por_grupo_operacional: porOperacao,
        por_familia: porFamilia,
        por_cliente: porCliente,
        cruzamento_realizado_meta_pipeline: cruzamento,
        lista_detalhada_ovs: registros,
        alertas_pipeline: [],
        lacunas_para_evolucao: {
            ov_individualizada_disponivel: ovs.some(ov => ov.NumeroOV || ov.OV || ov.NumeroProposta || ov.Proposta),
            cliente_disponivel: hasCliente,
            familia_disponivel: hasFamilia,
            campos_nao_disponiveis_na_exportacao_atual: ['NumeroOV', 'NumeroProposta', 'Cliente', 'CNPJ', 'Familia', 'Produto']
                .filter(campo => !ovs.some(ov => ov[campo] || (campo === 'NumeroOV' && ov.OV) || (campo === 'NumeroProposta' && ov.Proposta))),
            recomendacao: 'Para cruzar pipeline por cliente e familia, exportar do Benner/Cubo uma base de OVs individualizadas contendo numero da OV/proposta, cliente/documento, familia/produto, centro, mes, status e valor.'
        }
    };

    pipeline.alertas_pipeline = _aiBuildPipelineAlertas(pipeline, cruzamento);
    return pipeline;
}

function buildAIAnalyticalBase() {
    const data = Array.isArray(globalData) ? globalData : [];
    const metas = Array.isArray(globalMetas) ? globalMetas : [];
    const ovs = Array.isArray(globalOVs) ? globalOVs : [];
    const totalGeral = data.reduce((sum, d) => sum + (Number(d.Valor) || 0), 0);
    const todosAnos = Array.from(new Set(data.map(d => d.Ano))).filter(Boolean).sort();

    const resumo = _aiBuildResumoGeral(data, metas, ovs);
    const anos = _aiBuildAnos(data, metas);
    const clientes = _aiBuildClientes(data, todosAnos, totalGeral);
    const familias = _aiBuildDimensao(data, 'Familia', totalGeral);
    const centros = _aiBuildDimensao(data, 'Centro', totalGeral);
    const geografia = {
        ufs: _aiBuildDimensao(data, 'UF', totalGeral),
        cidades: _aiBuildDimensao(data, 'Cidade', totalGeral)
    };
    const setores = _aiBuildSetores(data, totalGeral);
    const pipelineOperacional = _aiBuildPipelineOperacional(ovs, data, metas);

    return {
        projeto: 'Mirante Estrategico Tecpar',
        tipo_exportacao: 'base_analitica_para_ia',
        versao_exportacao: AI_ANALYTICS_VERSION,
        data_extracao: new Date().toISOString(),
        observacoes_privacidade: [
            'CPFs sao mascarados e identificados por hash tecnico.',
            'CNPJs podem aparecer como CNPJ raiz por se tratar de pessoa juridica.',
            'O JSON e gerado localmente no navegador a partir das bases carregadas pelo usuario.'
        ],
        resumo_geral: resumo,
        anos,
        centros,
        clientes,
        familias,
        geografia,
        setores,
        pipeline_operacional: pipelineOperacional,
        rankings: _aiBuildRankings(clientes, familias, centros, geografia),
        alertas: _aiBuildAlertas(clientes, familias, totalGeral).concat(pipelineOperacional.alertas_pipeline || []),
        oportunidades: _aiBuildOportunidades(clientes),
        dicionario_campos: {
            status_carteira: {
                novo: 'Cliente com faturamento apenas no ano mais recente.',
                novo_no_periodo: 'Cliente que apareceu depois do primeiro ano disponivel e so tem um ano ativo.',
                recorrente: 'Cliente com faturamento em mais de um ano sem lacuna relevante.',
                pontual: 'Cliente com faturamento em apenas um ano que nao e o mais recente.',
                perdido: 'Cliente sem faturamento no ano mais recente.',
                voltador: 'Cliente que teve lacuna de faturamento e voltou no ano mais recente.'
            },
            risco_churn: {
                baixo: 'Sem queda relevante detectada.',
                medio: 'Queda forte no ano mais recente frente ao ano anterior.',
                alto: 'Sem faturamento no ano mais recente ou cliente perdido.'
            },
            pipeline_operacional: {
                pipeline_confirmado: 'OVs confirmadas, ainda nao necessariamente convertidas em faturamento realizado.',
                pipeline_em_faturamento: 'OVs em processo de faturamento.',
                pipeline_cadastrado: 'OVs cadastradas, em estagio inicial do pipeline.',
                perda_cancelamento: 'OVs canceladas.',
                realizado_ov: 'OVs marcadas como faturadas na base operacional.',
                cruzamento_realizado_meta_pipeline: 'Comparacao por centro e mes entre faturamento realizado, meta e pipeline aberto.'
            }
        }
    };
}

function exportAIAnalyticalBase() {
    if (!globalData || globalData.length === 0) {
        alert('Nao ha dados carregados. Carregue as bases CSV antes de exportar a base analitica.');
        return;
    }

    try {
        const payload = buildAIAnalyticalBase();
        _aiDownloadJson(payload, 'Base_Analitica_IA_Tecpar');
        console.log('[IA Analitica] Exportacao concluida:', payload.resumo_geral);
    } catch (err) {
        console.error('[IA Analitica] Erro ao exportar JSON analitico:', err);
        alert('Erro ao exportar base analitica para IA: ' + err.message);
    }
}
