/**
 * ARCOFOODS — Dashboard de Inteligência Comercial
 *
 * Camada de API: tenta falar com um backend Go real em /api/v1/*.
 * Se não houver servidor respondendo (como nesta pré-visualização),
 * cai automaticamente para um simulador local que devolve o MESMO
 * formato de dados que os handlers em internal/handlers/*.go retornam,
 * incluindo uma pequena latência artificial para imitar uma rede real.
 */
(function () {
    'use strict';

    // ============================================================
    // ESTADO
    // ============================================================
    const state = {
        periodo: '6',
        categoria: 'Todas',
        view: 'dashboard',
        apiOnline: null, // null = ainda não testado, true/false depois da 1ª chamada
    };

    const charts = {};

    // ============================================================
    // "BANCO" MOCKADO — espelha os structs do backend Go
    // ============================================================
    const MESES_12 = ['Set', 'Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago'];
    const FATURAMENTO_12 = [118000, 124000, 131000, 146000, 138000, 142000, 151000, 157000, 161000, 168000, 181000, 223000];

    const DB = {
        categorias: ['Alimentos', 'Limpeza', 'Bebidas', 'Higiene'],
        vendasCategoria: [48, 27, 15, 10],
        regioes: ['RJ', 'SP', 'MG', 'ES'],
        faturamentoRegiao: [850000, 420000, 310000, 180000],
        produtos: [
            { posicao: 1, nome: 'Arroz Tipo 1 - 5kg', categoria: 'Alimentos', valor: 120500 },
            { posicao: 2, nome: 'Feijão Carioca - 1kg', categoria: 'Alimentos', valor: 105200 },
            { posicao: 3, nome: 'Detergente Neutro', categoria: 'Limpeza', valor: 98700 },
            { posicao: 4, nome: 'Café Torrado 500g', categoria: 'Alimentos', valor: 87400 },
            { posicao: 5, nome: 'Papel Higiênico', categoria: 'Higiene', valor: 81900 },
            { posicao: 6, nome: 'Água Sanitária 1L', categoria: 'Limpeza', valor: 74300 },
            { posicao: 7, nome: 'Refrigerante Cola 2L', categoria: 'Bebidas', valor: 68100 },
            { posicao: 8, nome: 'Sabonete Líquido', categoria: 'Higiene', valor: 61250 },
            { posicao: 9, nome: 'Óleo de Soja 900ml', categoria: 'Alimentos', valor: 58900 },
            { posicao: 10, nome: 'Suco Concentrado 1L', categoria: 'Bebidas', valor: 52400 },
        ],
        vendedores: [
            { nome: 'João Silva', vendas: 280000, meta: 250000, status: 'success', label: 'Acima da meta' },
            { nome: 'Ana Costa', vendas: 220000, meta: 200000, status: 'success', label: 'Acima da meta' },
            { nome: 'Carlos Souza', vendas: 240000, meta: 250000, status: 'warning', label: 'Atenção' },
            { nome: 'Marcos Oliveira', vendas: 185000, meta: 220000, status: 'danger', label: 'Abaixo da meta' },
            { nome: 'Fernanda Lima', vendas: 265000, meta: 230000, status: 'success', label: 'Acima da meta' },
            { nome: 'Rodrigo Alves', vendas: 198000, meta: 210000, status: 'warning', label: 'Atenção' },
        ],
        clientes: { total: 1840, ativos: 1756, inativos90: 84, ticketMedio: 429, novosMes: 62 },
        insightsDashboard: [
            { icon: '📈', titulo: 'Crescimento regional', texto: 'A região ES apresentou crescimento de <strong>23%</strong> no período, indicando potencial para expansão comercial.' },
            { icon: '👥', titulo: 'Clientes inativos', texto: 'Foram identificados <strong>84 clientes</strong> sem compras há mais de 90 dias.' },
            { icon: '🧽', titulo: 'Oportunidade de cross-selling', texto: 'Clientes de alimentos apresentam baixa aquisição de produtos de limpeza.' },
            { icon: '💰', titulo: 'Margem', texto: 'Produtos de limpeza apresentam margem média superior à categoria de alimentos.' },
        ],
        insightsClientes: [
            { icon: '⏳', titulo: 'Risco de churn', texto: '84 clientes inativos há 90+ dias representam <strong>R$ 68 mil</strong> em faturamento potencial perdido.' },
            { icon: '🔁', titulo: 'Recompra', texto: 'Clientes recorrentes gastam em média <strong>2,4x mais</strong> que clientes de primeira compra.' },
            { icon: '🆕', titulo: 'Novos clientes', texto: '62 novos clientes entraram na base este mês, 14% acima da média histórica.' },
            { icon: '⭐', titulo: 'Ticket alto', texto: 'Os 10% clientes com maior ticket respondem por <strong>31%</strong> do faturamento total.' },
        ],
    };

    const CORES = { verde: '#16B979', azul: '#3B82F6', roxo: '#8B5CF6', laranja: '#F59E0B' };

    // ============================================================
    // HELPERS
    // ============================================================
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

    function moeda(valor) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor);
    }

    function moedaCompacta(valor) {
        return `R$ ${(valor / 1000).toFixed(0)}k`;
    }

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function sliceByPeriodo(arr, periodo) {
        const n = periodo === '3' ? 3 : periodo === '12' ? 12 : 6;
        return arr.slice(-n);
    }

    // ============================================================
    // CAMADA DE API
    // real -> tenta /api/v1/<path>; sem resposta -> cai no mock local
    // ============================================================
    async function apiGet(path, params = {}) {
        const qs = new URLSearchParams(params).toString();
        const url = `/api/v1/${path}${qs ? `?${qs}` : ''}`;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 900);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setApiStatus(true);
            return await res.json();
        } catch (err) {
            setApiStatus(false);
            await delay(280 + Math.random() * 260); // simula latência de rede
            return mockApi(path, params);
        }
    }

    function mockApi(path, params) {
        switch (path) {
            case 'kpis':
                return buildKpis(params.periodo || state.periodo);
            case 'faturamento-mensal': {
                const meses = sliceByPeriodo(MESES_12, params.periodo || state.periodo);
                const valores = sliceByPeriodo(FATURAMENTO_12, params.periodo || state.periodo);
                return { meses, valores };
            }
            case 'vendas-categoria': {
                const cat = params.categoria || state.categoria;
                if (cat && cat !== 'Todas') {
                    return { categorias: [cat], valores: [100] };
                }
                return { categorias: DB.categorias, valores: DB.vendasCategoria };
            }
            case 'faturamento-regiao':
                return { regioes: DB.regioes, valores: DB.faturamentoRegiao };
            case 'produtos': {
                const cat = params.categoria || state.categoria;
                const lista = cat && cat !== 'Todas' ? DB.produtos.filter((p) => p.categoria === cat) : DB.produtos;
                return lista;
            }
            case 'vendedores':
                return DB.vendedores;
            case 'clientes':
                return DB.clientes;
            case 'insights-dashboard':
                return DB.insightsDashboard;
            case 'insights-clientes':
                return DB.insightsClientes;
            case 'meta':
                return { realizado: 1840000, meta: 1940000, percentual: 94.8 };
            default:
                return {};
        }
    }

    /** Recalcula KPIs a partir do faturamento do período — números coerentes entre si. */
    function buildKpis(periodo) {
        const valores = sliceByPeriodo(FATURAMENTO_12, periodo);
        const faturamento = valores.reduce((a, b) => a + b, 0);
        const pedidos = Math.round(faturamento / 429);
        const ticketMedio = Math.round(faturamento / pedidos);
        return {
            faturamento,
            faturamentoVar: 12.4,
            pedidos,
            pedidosVar: 8.7,
            ticketMedio,
            ticketMedioVar: 4.2,
            margemBruta: 23.7,
            margemBrutaVar: 1.8,
        };
    }

    function setApiStatus(online) {
        if (state.apiOnline === online) return;
        state.apiOnline = online;
        const dot = $('#status-dot');
        const label = $('#status-label');
        if (online) {
            dot.className = 'live-dot';
            label.textContent = 'Backend Go conectado';
        } else {
            dot.className = 'live-dot offline';
            label.textContent = 'Simulação local (sem servidor Go)';
        }
    }

    function touchLastUpdate() {
        $('#last-update').textContent = `atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // ============================================================
    // RENDERIZAÇÃO — DASHBOARD
    // ============================================================
    function renderKpis(kpi) {
        const detalheFaturamento = DB.categorias
            .map((c, i) => `${c}: ${moeda(Math.round((kpi.faturamento * DB.vendasCategoria[i]) / 100))}`)
            .join(' · ');

        const cards = [
            { id: 'faturamento', label: 'Faturamento', icon: '💰', value: moeda(kpi.faturamento), delta: kpi.faturamentoVar, detalhe: detalheFaturamento },
            { id: 'pedidos', label: 'Pedidos', icon: '🛒', value: kpi.pedidos.toLocaleString('pt-BR'), delta: kpi.pedidosVar, detalhe: `Ticket médio: ${moeda(kpi.ticketMedio)} por pedido` },
            { id: 'ticket', label: 'Ticket Médio', icon: '📈', value: moeda(kpi.ticketMedio), delta: kpi.ticketMedioVar, detalhe: 'RJ R$ 480 · SP R$ 410 · MG R$ 395 · ES R$ 375' },
            { id: 'margem', label: 'Margem Bruta', icon: '💎', value: `${kpi.margemBruta}%`, delta: kpi.margemBrutaVar, detalhe: 'Limpeza 27,4% · Alimentos 21,1% · Bebidas 19,8%' },
        ];

        $('#kpi-grid').innerHTML = cards.map((c) => `
            <div class="card kpi">
                <div class="kpi-header">
                    <span>${c.label}</span>
                    <button type="button" class="kpi-icon-btn" data-kpi="${c.id}" aria-expanded="false" aria-controls="detalhe-${c.id}" title="Ver detalhamento">${c.icon}</button>
                </div>
                <h2>${c.value}</h2>
                <div class="variation positive">
                    <span aria-hidden="true">▲</span> ${c.delta}%
                    <span>vs. período anterior</span>
                </div>
                <div class="kpi-detail is-hidden" id="detalhe-${c.id}">${c.detalhe}</div>
            </div>
        `).join('');

        $$('.kpi-icon-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const detalhe = document.getElementById(`detalhe-${btn.dataset.kpi}`);
                const aberto = !detalhe.classList.contains('is-hidden');
                detalhe.classList.toggle('is-hidden');
                btn.setAttribute('aria-expanded', String(!aberto));
            });
        });
    }

    function renderInsights(container, lista) {
        container.innerHTML = lista.map((i) => `
            <div class="insight">
                <span class="insight-icon" aria-hidden="true">${i.icon}</span>
                <div>
                    <h3>${i.titulo}</h3>
                    <p>${i.texto}</p>
                </div>
            </div>
        `).join('');
    }

    function renderMeta(meta) {
        $('#meta-total').textContent = `${meta.percentual.toFixed(1).replace('.', ',')}% da meta`;
        $('#meta-progress').style.width = `${meta.percentual}%`;
        $('#meta-bar').setAttribute('aria-valuenow', String(meta.percentual));
        $('#meta-realizado').textContent = moeda(meta.realizado);
        $('#meta-meta').textContent = moeda(meta.meta);
    }

    // ---- gráficos ----
    function tooltipBase(extra) {
        return Object.assign({ backgroundColor: '#101828', titleColor: '#fff', bodyColor: '#D0D5DD', borderColor: '#344054', borderWidth: 1, padding: 12, displayColors: false }, extra);
    }

    function renderChartFaturamento(data) {
        const canvas = $('#faturamentoChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const gradiente = ctx.createLinearGradient(0, 0, 0, 300);
        gradiente.addColorStop(0, 'rgba(22,185,121,0.20)');
        gradiente.addColorStop(1, 'rgba(22,185,121,0.00)');

        if (charts.faturamento) charts.faturamento.destroy();
        charts.faturamento = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.meses,
                datasets: [{
                    label: 'Faturamento', data: data.valores, borderColor: CORES.verde, backgroundColor: gradiente,
                    borderWidth: 3, tension: 0.4, fill: true, pointRadius: 3, pointBackgroundColor: '#fff',
                    pointBorderColor: CORES.verde, pointBorderWidth: 2, pointHoverRadius: 6,
                }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { display: false }, tooltip: tooltipBase({ callbacks: { label: (c) => `Faturamento: ${moeda(c.raw)}` } }) },
                scales: {
                    x: { grid: { display: false }, border: { display: false } },
                    y: { border: { display: false }, grid: { color: 'rgba(152,162,179,.12)' }, ticks: { callback: moedaCompacta } },
                },
            },
        });
    }

    function renderChartCategoria(data) {
        const canvas = $('#categoriaChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (charts.categoria) charts.categoria.destroy();
        charts.categoria = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.categorias,
                datasets: [{ data: data.valores, backgroundColor: [CORES.verde, CORES.azul, CORES.roxo, CORES.laranja], borderWidth: 0, hoverOffset: 7 }],
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '72%',
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, padding: 14 } },
                    tooltip: tooltipBase({ callbacks: { label: (c) => `${c.label}: ${c.raw}%` } }),
                },
            },
        });
    }

    function renderChartRegiao(data) {
        const canvas = $('#regiaoChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (charts.regiao) charts.regiao.destroy();
        charts.regiao = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.regioes,
                datasets: [{ label: 'Faturamento', data: data.valores, backgroundColor: [CORES.verde, CORES.azul, CORES.roxo, CORES.laranja], borderRadius: 7, borderSkipped: false, barThickness: 28 }],
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: tooltipBase({ callbacks: { label: (c) => `Faturamento: ${moeda(c.raw)}` } }) },
                scales: {
                    x: { grid: { display: false }, border: { display: false } },
                    y: { beginAtZero: true, border: { display: false }, grid: { color: 'rgba(152,162,179,.12)' }, ticks: { callback: moedaCompacta } },
                },
            },
        });
    }

    // ============================================================
    // CARREGAMENTO POR VIEW
    // ============================================================
    async function loadDashboard() {
        toggleLoading('view-dashboard', true);
        try {
            const [kpis, faturamento, categoria, meta, insights] = await Promise.all([
                apiGet('kpis', { periodo: state.periodo }),
                apiGet('faturamento-mensal', { periodo: state.periodo }),
                apiGet('vendas-categoria', { categoria: state.categoria }),
                apiGet('meta'),
                apiGet('insights-dashboard'),
            ]);
            renderKpis(kpis);
            renderChartFaturamento(faturamento);
            renderChartCategoria(categoria);
            renderMeta(meta);
            renderInsights($('#insight-grid'), insights);
            touchLastUpdate();
        } finally {
            toggleLoading('view-dashboard', false);
        }
    }

    async function loadProdutos() {
        toggleLoading('view-produtos', true);
        try {
            const produtos = await apiGet('produtos', { categoria: state.categoria });
            $('#tabela-produtos').innerHTML = produtos.map((p) => `
                <tr>
                    <td>${String(p.posicao).padStart(2, '0')}</td>
                    <td><strong>${p.nome}</strong></td>
                    <td>${p.categoria}</td>
                    <td><strong>${moeda(p.valor)}</strong></td>
                </tr>
            `).join('') || '<tr><td colspan="4">Nenhum produto para esta categoria.</td></tr>';
            touchLastUpdate();
        } finally {
            toggleLoading('view-produtos', false);
        }
    }

    async function loadClientes() {
        toggleLoading('view-clientes', true);
        try {
            const [clientes, insights] = await Promise.all([apiGet('clientes'), apiGet('insights-clientes')]);
            $('#kpi-clientes').innerHTML = `
                <div class="card kpi"><div class="kpi-header"><span>Total de clientes</span><div class="icon" aria-hidden="true">👥</div></div><h2>${clientes.total.toLocaleString('pt-BR')}</h2><div class="variation positive"><span>base ativa cadastrada</span></div></div>
                <div class="card kpi"><div class="kpi-header"><span>Clientes ativos</span><div class="icon" aria-hidden="true">✅</div></div><h2>${clientes.ativos.toLocaleString('pt-BR')}</h2><div class="variation positive"><span>compraram nos últimos 90 dias</span></div></div>
                <div class="card kpi"><div class="kpi-header"><span>Inativos (90+ dias)</span><div class="icon" aria-hidden="true">⏳</div></div><h2>${clientes.inativos90}</h2><div class="variation"><span>sem compras recentes</span></div></div>
                <div class="card kpi"><div class="kpi-header"><span>Novos no mês</span><div class="icon" aria-hidden="true">🆕</div></div><h2>${clientes.novosMes}</h2><div class="variation positive"><span>entraram na base</span></div></div>
            `;
            renderInsights($('#insight-grid-clientes'), insights);
            touchLastUpdate();
        } finally {
            toggleLoading('view-clientes', false);
        }
    }

    async function loadVendedores() {
        toggleLoading('view-vendedores', true);
        try {
            const vendedores = await apiGet('vendedores');
            $('#tabela-vendedores').innerHTML = vendedores.map((v) => {
                const atingimento = Math.round((v.vendas / v.meta) * 100);
                return `
                    <tr>
                        <td><strong>${v.nome}</strong></td>
                        <td>${moeda(v.vendas)}</td>
                        <td>${moeda(v.meta)}</td>
                        <td><strong>${atingimento}%</strong></td>
                        <td><span class="badge ${v.status}">${v.label}</span></td>
                    </tr>
                `;
            }).join('');
            touchLastUpdate();
        } finally {
            toggleLoading('view-vendedores', false);
        }
    }

    async function loadRegioes() {
        toggleLoading('view-regioes', true);
        try {
            const dados = await apiGet('faturamento-regiao');
            renderChartRegiao(dados);
            $('#tabela-regioes').innerHTML = dados.regioes.map((r, i) => `
                <tr><td><strong>${r}</strong></td><td>${moeda(dados.valores[i])}</td></tr>
            `).join('');
            touchLastUpdate();
        } finally {
            toggleLoading('view-regioes', false);
        }
    }

    const LOADERS = { dashboard: loadDashboard, produtos: loadProdutos, clientes: loadClientes, vendedores: loadVendedores, regioes: loadRegioes };

    const TITULOS = {
        dashboard: ['Dashboard Comercial', 'Visão geral da performance comercial da empresa'],
        produtos: ['Produtos', 'Ranking de faturamento por produto'],
        clientes: ['Clientes', 'Comportamento e saúde da base de clientes'],
        vendedores: ['Vendedores', 'Ranking comercial da equipe de vendas'],
        regioes: ['Regiões', 'Distribuição geográfica do faturamento'],
    };

    function toggleLoading(viewId, isLoading) {
        document.getElementById(viewId).classList.toggle('is-loading', isLoading);
    }

    // ============================================================
    // NAVEGAÇÃO ENTRE VIEWS
    // ============================================================
    function goToView(view) {
        state.view = view;

        $$('.view').forEach((el) => el.classList.add('is-hidden'));
        document.getElementById(`view-${view}`).classList.remove('is-hidden');

        $$('.nav-link').forEach((link) => {
            const active = link.dataset.view === view;
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });

        const [titulo, subtitulo] = TITULOS[view];
        $('#titulo-view').textContent = titulo;
        $('#subtitulo-view').textContent = subtitulo;
        $('#breadcrumb').textContent = `Arcofoods / ${titulo}`;

        // Filtro de categoria só faz sentido para Dashboard e Produtos
        $('#categoria').disabled = !(view === 'dashboard' || view === 'produtos');

        LOADERS[view]();
    }

    function bindNavegacao() {
        $$('.nav-link').forEach((link) => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (link.dataset.view !== state.view) goToView(link.dataset.view);
            });
        });
    }

    // ============================================================
    // FILTROS
    // ============================================================
    function bindFiltros() {
        $('#periodo').addEventListener('change', (e) => {
            state.periodo = e.target.value;
            LOADERS[state.view]();
        });

        $('#categoria').addEventListener('change', (e) => {
            state.categoria = e.target.value;
            LOADERS[state.view]();
        });
    }

    // ============================================================
    // EXPORTAÇÃO CSV (usa a capability "downloads" quando disponível,
    // com fallback para o download padrão do navegador)
    // ============================================================
    function toCSV(headers, rows) {
        const escapar = (v) => `"${String(v).replace(/"/g, '""')}"`;
        const linhas = [headers.map(escapar).join(';'), ...rows.map((r) => r.map(escapar).join(';'))];
        return linhas.join('\r\n');
    }

    function datasetAtual() {
        switch (state.view) {
            case 'produtos':
                return { nome: 'produtos', headers: ['Posição', 'Produto', 'Categoria', 'Faturamento'], rows: DB.produtos.map((p) => [p.posicao, p.nome, p.categoria, p.valor]) };
            case 'vendedores':
                return { nome: 'vendedores', headers: ['Vendedor', 'Vendas', 'Meta', 'Status'], rows: DB.vendedores.map((v) => [v.nome, v.vendas, v.meta, v.label]) };
            case 'regioes':
                return { nome: 'regioes', headers: ['Região', 'Faturamento'], rows: DB.regioes.map((r, i) => [r, DB.faturamentoRegiao[i]]) };
            case 'clientes':
                return { nome: 'clientes', headers: ['Métrica', 'Valor'], rows: Object.entries(DB.clientes) };
            default:
                return { nome: 'faturamento-mensal', headers: ['Mês', 'Faturamento'], rows: MESES_12.map((m, i) => [m, FATURAMENTO_12[i]]) };
        }
    }

    async function exportarCSV() {
        const btn = $('#btn-export');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span aria-hidden="true">⏳</span> Gerando...';

        const { nome, headers, rows } = datasetAtual();
        const csv = toCSV(headers, rows);
        const filename = `arcofoods-${nome}.csv`;

        try {
            if (typeof window.claude !== 'undefined') {
                const downloads = await window.claude.use('downloads').catch(() => null);
                if (downloads) {
                    await downloads.save({ filename, data: csv });
                    btn.innerHTML = '<span aria-hidden="true">✅</span> Exportado!';
                    return;
                }
            }
            // Fallback padrão do navegador (funciona quando o arquivo roda fora do sandbox do artifact)
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            btn.innerHTML = '<span aria-hidden="true">✅</span> Exportado!';
        } catch (err) {
            console.error('Falha ao exportar CSV:', err);
            btn.innerHTML = '<span aria-hidden="true">⚠️</span> Falhou';
        } finally {
            setTimeout(() => {
                btn.innerHTML = original;
                btn.disabled = false;
            }, 1800);
        }
    }

    function bindExportacao() {
        $('#btn-export').addEventListener('click', exportarCSV);
    }

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        bindNavegacao();
        bindFiltros();
        bindExportacao();
        goToView('dashboard');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
