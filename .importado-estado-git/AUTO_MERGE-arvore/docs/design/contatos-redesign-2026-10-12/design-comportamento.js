// Comportamento do design (render de cards, ficha, filtros, carrossel). Dados demonstrativos. Reescrever em React; não copiar.

(() => {
  const root = document.getElementById('zc-redesign');
  if (!root) return;
  const $ = id => root.querySelector('#' + id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => '<i data-lucide="'+name+'" aria-hidden="true"></i>';
  const paintIcons = () => { if (typeof lucide !== 'undefined') lucide.createIcons({ attrs: { width:16,height:16 } }); };
  const photos = ['data:omitido','data:omitido','data:omitido','data:omitido','data:omitido','data:omitido','data:omitido','data:omitido'];
  const contactTypes = ['Todos','Cliente','Fornecedor','Transportadora','Colaborador','Prestador de Serviço','Parceiro'];
  const dots = {'Cliente':'hsl(217 100% 54%)','Fornecedor':'hsl(270 60% 60%)','Transportadora':'hsl(25 90% 50%)','Colaborador':'hsl(142 71% 45%)','Prestador de Serviço':'hsl(38 92% 50%)','Parceiro':'hsl(0 72% 51%)'};
  let contacts = [
    {id:1,name:'Ana Carvalho',company:'Aurora Design',department:'Compras',role:'Gerente de compras',phone:'(11) 90000-0101',email:'ana.carvalho@example.com',type:'Cliente',city:'São Paulo, SP',birthday:'18 de setembro',last:'Hoje, 08:12',lastShort:'Hoje',photo:0,address:'Av. Exemplo, 280 · Vila Mariana',postal:'00000-000',owner:'Joaquim',notes:['Prefere receber propostas por e-mail. Os próximos kits são para o encontro anual de colaboradores.'],events:[{icon:'message-square',date:'Hoje · 08:12',title:'Conversa sobre o próximo pedido',description:'Alinhamento de quantidade, prazo e opções para os kits de boas-vindas.'},{icon:'mail',date:'09 out · 15:30',title:'Proposta enviada por e-mail',description:'Apresentação das opções de produtos e personalização.'},{icon:'phone',date:'07 out · 10:15',title:'Ligação de acompanhamento',description:'Conversa sobre o evento e as necessidades da equipe.'}]},
    {id:2,name:'Rafael Almeida',company:'Forma Presentes',department:'Comercial',role:'Diretor comercial',phone:'(11) 90000-0102',email:'rafael.almeida@example.com',type:'Fornecedor',city:'Campinas, SP',birthday:'07 de fevereiro',last:'Hoje, 07:56',lastShort:'Hoje',photo:1,address:'Rua Modelo, 142 · Centro',postal:'00000-000',owner:'Joaquim',notes:['Referência para canecas e copos. Confirmar disponibilidade antes de concluir a proposta.'],events:[{icon:'mail',date:'Hoje · 07:56',title:'Atualização de disponibilidade',description:'Retorno sobre cores e quantidade em estoque.'},{icon:'phone',date:'08 out · 14:20',title:'Conversa com o fornecedor',description:'Alinhamento de prazos para os pedidos de outubro.'}]},
    {id:3,name:'Camila Rodrigues',company:'Vértice Logística',department:'Operações',role:'Coordenadora de operações',phone:'(11) 90000-0103',email:'camila.rodrigues@example.com',type:'Transportadora',city:'São Paulo, SP',birthday:'22 de abril',last:'09 out, 17:38',lastShort:'09 out',photo:2,address:'Rua Ilustração, 56 · Vila Leopoldina',postal:'00000-000',owner:'Joaquim',notes:['Consolidar as coletas da semana. Precisa receber as dimensões dos volumes com antecedência.'],events:[{icon:'phone',date:'09 out · 17:38',title:'Coleta confirmada',description:'Alinhamento da janela de retirada e do destino.'},{icon:'message-square',date:'08 out · 11:20',title:'Conversa sobre transporte',description:'Consulta de prazo para entregas na região de São Paulo.'}]},
    {id:4,name:'Lucas Ferreira',company:'Estúdio Norte',department:'Marketing',role:'Diretor de marketing',phone:'(11) 90000-0104',email:'lucas.ferreira@example.com',type:'Cliente',city:'São Paulo, SP',birthday:'15 de novembro',last:'09 out, 14:10',lastShort:'09 out',photo:3,address:'Av. Demonstração, 710 · Pinheiros',postal:'00000-000',owner:'Joaquim',notes:['Prioriza acabamento discreto e produtos em tons neutros. Apresentar duas opções de embalagem.'],events:[{icon:'mail',date:'09 out · 14:10',title:'Referências de campanha recebidas',description:'Material visual compartilhado para orientar a seleção de brindes.'},{icon:'message-square',date:'07 out · 16:40',title:'Novo projeto em conversa',description:'Primeiro alinhamento sobre os kits do próximo evento.'}]},
    {id:5,name:'Juliana Oliveira',company:'Promo Brindes',department:'Comercial',role:'Executiva de contas',phone:'(11) 90000-0105',email:'juliana.oliveira@example.com',type:'Colaborador',city:'São Paulo, SP',birthday:'03 de junho',last:'08 out, 16:22',lastShort:'08 out',photo:4,address:'Rua Exemplo, 35 · Centro',postal:'00000-000',owner:'Joaquim',notes:['Acompanha os projetos de kits corporativos.'],events:[{icon:'message-square',date:'08 out · 16:22',title:'Alinhamento interno',description:'Revisão das demandas da semana.'}]},
    {id:6,name:'Bruno Martins',company:'Ponto Criativo',department:'Criação',role:'Designer de produto',phone:'(11) 90000-0106',email:'bruno.martins@example.com',type:'Prestador de Serviço',city:'Santo André, SP',birthday:'28 de julho',last:'08 out, 10:45',lastShort:'08 out',photo:5,address:'Rua Modelo, 88 · Centro',postal:'00000-000',owner:'Joaquim',notes:['Revisar arquivos finais antes de iniciar a produção.'],events:[{icon:'mail',date:'08 out · 10:45',title:'Arquivos revisados',description:'Retorno sobre o fechamento das artes do projeto.'}]},
    {id:7,name:'Marina Costa',company:'Horizonte Eventos',department:'Parcerias',role:'Gerente de relacionamento',phone:'(11) 90000-0107',email:'marina.costa@example.com',type:'Parceiro',city:'São Paulo, SP',birthday:'11 de março',last:'07 out, 11:52',lastShort:'07 out',photo:6,address:'Av. Exemplo, 902 · Moema',postal:'00000-000',owner:'Joaquim',notes:['Eventos corporativos com foco em experiência de marca.'],events:[{icon:'phone',date:'07 out · 11:52',title:'Conversa sobre parceria',description:'Planejamento das próximas ações em conjunto.'}]},
    {id:8,name:'Renata Ribeiro',company:'Atlas Tecnologia',department:'People & Culture',role:'Coordenadora de pessoas',phone:'(11) 90000-0108',email:'renata.ribeiro@example.com',type:'Cliente',city:'Barueri, SP',birthday:'09 de dezembro',last:'06 out, 15:08',lastShort:'06 out',photo:7,address:'Rua Ilustração, 320 · Alphaville',postal:'00000-000',owner:'Joaquim',notes:['Kit de boas-vindas para novas contratações. Confirmar os tamanhos das camisetas.'],events:[{icon:'mail',date:'06 out · 15:08',title:'Briefing recebido',description:'Informações iniciais para a montagem dos kits de onboarding.'}]}
  ].map((c,index) => ({...c,
    phones:index===0?[{label:'Corporativo principal',value:c.phone},{label:'Pessoal',value:'(11) 90000-1101'}]:[{label:'Corporativo principal',value:c.phone}],
    emails:index===0?[{label:'Corporativo principal',value:c.email},{label:'Pessoal',value:'ana.pessoal@example.com'}]:[{label:'Corporativo principal',value:c.email}],
    social:Object.fromEntries(['linkedin','instagram','facebook','website'].map(key=>[key,index===7?'':'https://example.com/perfil/'+c.id+'/'+key]))
  }));
  const typeIcons={'Todos':'users-round','Cliente':'user-round','Fornecedor':'truck','Transportadora':'package','Colaborador':'user-round-check','Prestador de Serviço':'wrench','Parceiro':'handshake'};
  const demoNow=new Date('2026-10-12T12:00:00-03:00');
  const createdDates=['2026-10-12T08:00:00-03:00','2026-10-09T10:00:00-03:00','2026-10-08T11:00:00-03:00','2026-10-07T10:00:00-03:00','2026-10-06T11:00:00-03:00','2026-10-05T10:00:00-03:00','2026-10-02T11:00:00-03:00','2026-10-01T10:00:00-03:00'];
  const updatedDates=['2026-10-12T08:12:00-03:00','2026-10-12T07:56:00-03:00','2026-10-09T17:38:00-03:00','2026-10-09T14:10:00-03:00','2026-10-08T16:22:00-03:00','2026-10-08T10:45:00-03:00','2026-10-07T11:52:00-03:00','2026-10-06T15:08:00-03:00'];
  const demoTags=[['Eventos','Kits corporativos'],['Fornecimento'],['Logística'],['Eventos'],['Equipe'],['Criação'],['Eventos'],['Kits corporativos']];
  contacts=contacts.map((c,i)=>({...c,createdAt:createdDates[i],updatedAt:updatedDates[i],tags:demoTags[i],legacy:false,stage:'Sem estágio'}));
  contacts.push({id:9,name:'Contato legado',company:'',department:'',role:'',phone:'4570000000000000',email:'',type:'Cliente',city:'Não informada',birthday:'',last:'Sem interação registrada',lastShort:'Sem interação',photo:null,address:'',owner:'Joaquim',notes:[],events:[],phones:[{label:'Identificador legado',value:'4570000000000000'}],emails:[],social:{linkedin:'',instagram:'',facebook:'',website:''},createdAt:'2025-02-15T10:00:00-03:00',updatedAt:'2025-02-15T10:00:00-03:00',tags:[],legacy:true,stage:'Sem estágio'});
  let filter='Todos',query='',view='grid',page=0,currentId=null,currentTab='details',lastFocus=null,naturalHeight=0,layoutSize=4,columnCount=4,showLegacy=false,groupByCompany=false,tableSort=null,openPopover=null;
  let advanced={company:'',role:'',tag:'',period:''},selected=new Set(),presets=[],nextPresetId=1;
  const normalize=v=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const getSize=()=>{const width=root.getBoundingClientRect().width;return width>=1200?columnCount:width>=900?Math.min(columnCount,3):width>=560?2:1;};
  const initials=c=>c.name.split(/\s+/).map(w=>w[0]).slice(0,2).join('');
  const photo=(c,cls,decorative=false)=>c.photo==null?'<span class="'+(cls==='zc-mini-image'?'zc-mini-initials':'zc-fallback')+'">'+esc(initials(c))+'</span>':'<img class="'+cls+'" src="'+photos[c.photo]+'" alt="'+(decorative?'':'Retrato demonstrativo de '+esc(c.name))+'" loading="eager">';
  const typeBadge=c=>'<span class="zc-type" style="--zc-type-dot:'+dots[c.type]+'">'+esc(c.type==='Prestador de Serviço'?'Prestador':c.type)+'</span>';
  const universe=()=>contacts.filter(c=>!c.deleted&&(showLegacy||(!c.legacy&&/^\d{10,15}$/.test(c.phone.replace(/\D/g,'')))));
  const hasPresetCriteria=()=>filter!=='Todos'||Object.values(advanced).some(Boolean);
  function periodStart(){const d=new Date(demoNow);if(advanced.period==='today')d.setDate(d.getDate()-1);else if(advanced.period==='week')d.setDate(d.getDate()-7);else if(advanced.period==='month')d.setMonth(d.getMonth()-1);else if(advanced.period==='quarter')d.setMonth(d.getMonth()-3);else if(advanced.period==='year')d.setFullYear(d.getFullYear()-1);else return null;return d;}
  function filtered(){
    const q=normalize(query),digits=q.replace(/\D/g,''),phoneQuery=/^[+\d\s().-]+$/.test(q)&&digits.length>0,start=periodStart();
    const result=universe().filter(c=>(filter==='Todos'||c.type===filter)&&(!advanced.company||c.company===advanced.company)&&(!advanced.role||c.role===advanced.role)&&(!advanced.tag||c.tags.includes(advanced.tag))&&(!start||new Date(c.createdAt)>=start)&&(!q||normalize([c.name,c.company,c.role,...c.phones.map(p=>p.value),...c.emails.map(e=>e.value)].join(' ')).includes(q)||(phoneQuery&&c.phones.some(p=>p.value.replace(/\D/g,'').includes(digits)))));
    const order=$('zc-sort').value;
    if(order==='name_asc')result.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    else if(order==='name_desc')result.sort((a,b)=>b.name.localeCompare(a.name,'pt-BR'));
    else if(order==='created_desc')result.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    else if(order==='created_asc')result.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    else if(order==='updated_desc')result.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    return result;
  }
  function renderFilters(){
    const all=universe();
    $('zc-filters').innerHTML=contactTypes.map(t=>'<button type="button" class="zc-filter cursor-interaction" data-type="'+esc(t)+'" aria-pressed="'+(filter===t)+'">'+icon(typeIcons[t])+esc(t)+'<small>'+(t==='Todos'?all.length:all.filter(c=>c.type===t).length)+'</small></button>').join('');
    $('zc-total').textContent=all.length;
    $('zc-stat-new').textContent=all.filter(c=>demoNow-new Date(c.createdAt)<=30*86400000).length;
    $('zc-stat-companies').textContent=new Set(all.map(c=>c.company).filter(Boolean)).size;
    $('zc-stat-suppliers').textContent=all.filter(c=>c.type==='Fornecedor').length;
    const options=(values,empty,chosen)=>'<option value="">'+empty+'</option>'+[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(v=>'<option value="'+esc(v)+'"'+(v===chosen?' selected':'')+'>'+esc(v)+'</option>').join('');
    $('zc-filter-company').innerHTML=options(all.map(c=>c.company),'Todas as empresas',advanced.company);
    $('zc-filter-role').innerHTML=options(all.map(c=>c.role),'Todos os cargos',advanced.role);
    $('zc-filter-tag').innerHTML=options(all.flatMap(c=>c.tags),'Todas as etiquetas',advanced.tag);
    $('zc-filter-period').value=advanced.period;
    renderFilterCount();renderPresets();paintIcons();
  }
  function renderFilterCount(){const count=Object.values(advanced).filter(Boolean).length;$('zc-filter-count').textContent=count;$('zc-filter-count').hidden=count===0;}
  function selectionInput(c,photoPosition=false){return '<label class="'+(photoPosition?'zc-card-selection':'zc-table-select')+'"><input type="checkbox" data-select="'+c.id+'" aria-label="Selecionar '+esc(c.name)+'"'+(selected.has(c.id)?' checked':'')+'></label>';}
  function card(c){return '<article class="zc-contact'+(selected.has(c.id)?' zc-is-selected':'')+'"><div class="zc-photo-wrap"><button type="button" class="zc-photo-button cursor-interaction" data-open="'+c.id+'" aria-label="Abrir ficha completa de '+esc(c.name)+'">'+photo(c,'zc-portrait')+'<span class="zc-photo-location">'+icon('map-pin')+esc(c.city)+'</span><span class="zc-photo-open">'+icon('arrow-up-right')+'</span></button><div class="zc-photo-type">'+typeBadge(c)+'</div>'+selectionInput(c,true)+'</div><div class="zc-contact-body"><div><h2 class="zc-contact-name">'+esc(c.name)+'</h2><p class="zc-company">'+icon('building-2')+esc(c.company||'Empresa não informada')+'</p></div><p class="zc-job"><span>'+esc(c.department||'Departamento não informado')+'</span><br>'+esc(c.role||'Cargo não informado')+'</p><div class="zc-contact-lines"><div class="zc-contact-line">'+icon(c.legacy?'archive':'phone')+'<span>'+esc(c.legacy?'Identificador legado':c.phone||'Telefone não informado')+'</span></div><div class="zc-contact-line">'+icon('mail')+'<span data-tooltip="'+esc(c.email||'E-mail não informado')+'">'+esc(c.email||'E-mail não informado')+'</span></div></div><div class="zc-last"><span>Última interação</span><strong>'+esc(c.lastShort==='Sem interação'?'Não registrada':c.last)+'</strong></div></div></article>';}
  function renderTable(rows){const headers=[['name','Contato'],['type','Tipo'],['phone','Telefone'],['email','Email'],['company','Empresa'],['role','Cargo']];return '<div class="zc-table-wrap"><table class="zc-table"><thead><tr><th aria-label="Seleção"></th>'+headers.map(([key,label])=>'<th><button type="button" class="cursor-interaction" data-table-sort="'+key+'">'+label+icon(tableSort&&tableSort.key===key?(tableSort.direction===1?'arrow-up':'arrow-down'):'arrow-down-up')+'</button></th>').join('')+'<th>Etiquetas</th><th>Ações</th></tr></thead><tbody>'+rows.map(c=>'<tr><td>'+selectionInput(c)+'</td><td><button type="button" class="zc-table-person cursor-interaction" data-open="'+c.id+'">'+photo(c,'zc-table-avatar',true)+'<span>'+esc(c.name)+'</span></button></td><td>'+typeBadge(c)+'</td><td>'+esc(c.legacy?'Identificador legado':c.phone||'Não informado')+'</td><td>'+esc(c.email||'Não informado')+'</td><td>'+esc(c.company||'Não informada')+'</td><td>'+esc(c.role||'Não informado')+'</td><td>'+c.tags.map(t=>'<span class="zc-table-tag">'+esc(t)+'</span>').join('')+'</td><td><button type="button" class="zc-icon-button cursor-interaction" data-open="'+c.id+'" aria-label="Abrir ficha de '+esc(c.name)+'">'+icon('arrow-up-right')+'</button></td></tr>').join('')+'</tbody></table></div>';}
  function renderAlternate(rows){
    if(view==='map'){const cities=[...new Set(rows.map(c=>c.city).filter(v=>v&&v!=='Não informada'))];return '<div class="zc-empty">'+icon('map-pin-off')+'<h3>Mapa de contatos</h3><p>Os contatos desta demonstração não possuem coordenadas geográficas.</p><div class="zc-city-list">'+cities.map(city=>'<span>'+esc(city)+'</span>').join('')+'</div></div>';}
    if(view==='pipeline')return '<div class="zc-alt-view"><h3>Pipeline</h3><p class="zc-alt-caption">Contatos demonstrativos sem etapa comercial vinculada.</p><div class="zc-pipeline"><section class="zc-pipeline-lane"><h4>Sem estágio · '+rows.length+'</h4>'+rows.map(c=>'<button type="button" class="zc-pipeline-person cursor-interaction" data-open="'+c.id+'">'+photo(c,'zc-pipeline-avatar',true)+'<span>'+esc(c.name)+'<small>'+esc(c.company||'Empresa não informada')+'</small></span></button>').join('')+'</section></div></div>';
    return '<div class="zc-alt-view"><h3>Analytics</h3><p class="zc-alt-caption">Distribuição dos '+rows.length+' contatos encontrados por tipo.</p><div class="zc-analytics">'+contactTypes.slice(1).map(type=>{const count=rows.filter(c=>c.type===type).length;return '<div class="zc-analytics-row"><span>'+esc(type)+'</span><div class="zc-analytics-track"><div class="zc-analytics-fill" style="width:'+(rows.length?count/rows.length*100:0)+'%"></div></div><strong>'+count+'</strong></div>';}).join('')+'</div></div>';
  }
  function visiblePageRows(){const result=filtered(),alternate=['pipeline','map','analytics'].includes(view),size=alternate?Math.max(1,result.length):view==='grid'?getSize():view==='table'?8:4;return result.slice(page*size,page*size+size);}
  function renderSelection(){const result=filtered(),valid=new Set(result.map(c=>c.id));selected=new Set([...selected].filter(id=>valid.has(id)));const rows=visiblePageRows(),pageSelected=rows.filter(c=>selected.has(c.id)).length,n=selected.size;$('zc-select-all').checked=!!rows.length&&pageSelected===rows.length;$('zc-select-all').indeterminate=pageSelected>0&&pageSelected<rows.length;$('zc-select-all').disabled=!rows.length;$('zc-selected-tools').hidden=n===0;$('zc-selected-count').textContent=n+' selecionado'+(n===1?'':'s');$('zc-compare').hidden=n<2;}
  function renderGallery(announce=false,resetRail=true){
    layoutSize=getSize();$('zc-gallery').style.setProperty('--zc-columns',layoutSize);
    const result=filtered(),alternate=['pipeline','map','analytics'].includes(view),size=alternate?Math.max(1,result.length):view==='grid'?layoutSize:view==='table'?8:4,pages=Math.max(1,Math.ceil(result.length/size));
    page=Math.max(0,Math.min(page,pages-1));renderSelection();
    let showing=result.slice(page*size,page*size+size),markup='';
    if(view==='table'&&tableSort)showing.sort((a,b)=>String(a[tableSort.key]||'').localeCompare(String(b[tableSort.key]||''),'pt-BR')*tableSort.direction);
    $('zc-gallery').classList.toggle('zc-list',view==='list');
    if(!showing.length)markup='<div class="zc-empty">'+icon('search-x')+'<h3>Nenhum contato encontrado</h3><p>Tente outro nome ou ajuste os filtros.</p><button type="button" class="zc-secondary cursor-interaction" id="zc-clear-filters">Limpar busca e filtros</button></div>';
    else if(view==='table')markup=renderTable(showing);
    else if(alternate)markup=renderAlternate(showing);
    else if(view==='list'&&groupByCompany){const groups=[...new Set(showing.map(c=>c.company||'Sem empresa'))].sort((a,b)=>a.localeCompare(b));markup=groups.map(company=>'<h3 class="zc-group-heading">'+icon('building-2')+esc(company)+'</h3>'+showing.filter(c=>(c.company||'Sem empresa')===company).map(card).join('')).join('');}
    else markup=showing.map(card).join('');
    $('zc-gallery').innerHTML=markup;
    $('zc-page-description').innerHTML=result.length?'Exibindo <strong>'+(page*size+1)+'–'+Math.min((page+1)*size,result.length)+'</strong> de <strong>'+result.length+' contatos</strong>':'Nenhum contato para exibir';
    $('zc-page-counter').textContent=(page+1)+' / '+pages;$('zc-page-prev').disabled=page===0;$('zc-page-next').disabled=page>=pages-1;
    for(const [id,mode] of [['zc-view-grid','grid'],['zc-view-list','list'],['zc-view-table','table']])$(id).setAttribute('aria-pressed',view===mode);
    $('zc-more-toggle').setAttribute('aria-pressed',alternate);
    root.querySelectorAll('[data-view]').forEach(el=>el.setAttribute('aria-pressed',el.dataset.view===view));
    root.querySelectorAll('[data-columns]').forEach(el=>el.setAttribute('aria-pressed',Number(el.dataset.columns)===columnCount));
    $('zc-column-options').hidden=view!=='grid';$('zc-columns-toggle').disabled=!['grid','list'].includes(view);
    $('zc-view-caption').textContent={grid:'Cards de contatos',list:groupByCompany?'Lista agrupada por empresa':'Lista de contatos',table:'Tabela de contatos',pipeline:'Pipeline de contatos',map:'Localização dos contatos',analytics:'Análise dos contatos'}[view];
    if(announce)$('zc-live').textContent=result.length+' contatos encontrados. Página '+(page+1)+' de '+pages+'.';
    renderFilterCount();renderPresets();if(resetRail)renderRail();paintIcons();updateOverlayHeight();
  }
  function closePopovers(){root.querySelectorAll('.zc-popover').forEach(p=>p.hidden=true);root.querySelectorAll('[aria-controls$="-pop"]').forEach(b=>b.setAttribute('aria-expanded','false'));openPopover=null;}
  function togglePopover(id,button){const wasOpen=!$(id).hidden;closePopovers();if(!wasOpen){$(id).hidden=false;button.setAttribute('aria-expanded','true');openPopover=id;renderPresets();paintIcons();}}
  function renderPresets(){
    $('zc-saved-list').innerHTML=presets.length?presets.map(p=>'<div class="zc-saved-row"><button type="button" class="cursor-interaction" data-apply-preset="'+p.id+'">'+esc(p.name)+'</button><button type="button" class="zc-icon-button cursor-interaction" data-delete-preset="'+p.id+'" aria-label="Excluir filtro salvo '+esc(p.name)+'">'+icon('trash-2')+'</button></div>').join(''):'<p class="zc-pop-empty">Nenhum filtro salvo</p>';
    $('zc-save-current').disabled=!hasPresetCriteria();$('zc-save-info').textContent=hasPresetCriteria()?'Salva o tipo e os filtros aplicados nesta prévia.':'Selecione um tipo ou aplique um filtro para salvar.';
  }
  function showComparison(){const rows=contacts.filter(c=>selected.has(c.id));if(rows.length<2)return;currentId=-1;$('zc-contact-prev').hidden=true;$('zc-contact-next').hidden=true;$('zc-dialog-context-label').textContent='Contatos / Comparação';$('zc-dialog-content').innerHTML='<div class="zc-compare-content"><h2 id="zc-dialog-title">Comparar contatos</h2><div class="zc-table-wrap"><table class="zc-table"><thead><tr><th>Dados</th>'+rows.map(c=>'<th>'+esc(c.name)+'</th>').join('')+'</tr></thead><tbody>'+[['Empresa','company'],['Tipo','type'],['Departamento','department'],['Cargo','role'],['Telefone','phone'],['E-mail','email'],['Cidade','city']].map(([label,key])=>'<tr><th>'+label+'</th>'+rows.map(c=>'<td>'+esc(c[key]||'Não informado')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></div>';showOverlay();paintIcons();}
  let manualPaused=window.matchMedia('(prefers-reduced-motion: reduce)').matches,railHover=false,railFocus=false,railOffset=0,lastFrame=0;
  const rail=$('zc-rail'),track=$('zc-rail-track');
  function renderRail(){railOffset=0;track.style.transform='translateX(0)';const result=filtered();track.innerHTML=result.length?result.map(c=>'<button type="button" class="zc-mini cursor-interaction" data-open="'+c.id+'" aria-label="Abrir ficha de '+esc(c.name)+'">'+photo(c,'zc-mini-image',true)+'<span class="zc-mini-copy"><span class="zc-mini-name">'+esc(c.name)+'</span><span class="zc-mini-company" data-tooltip="'+esc(c.company||'Empresa não informada')+'">'+esc(c.company||'Empresa não informada')+'</span></span><span class="zc-mini-arrow">'+icon('arrow-up-right')+'</span></button>').join(''):'<span class="zc-small-info">Nenhum contato neste filtro.</span>';updateRailControls();}
  function updateRailControls(){
    const canMove=filtered().length>1&&track.scrollWidth>rail.clientWidth;
    $('zc-rail-prev').disabled=!canMove;$('zc-rail-next').disabled=!canMove;$('zc-pause').disabled=!canMove;
  }
  const railStep=()=>track.firstElementChild?track.firstElementChild.getBoundingClientRect().width+11:224;
  function updatePause(){
    $('zc-pause').innerHTML=icon(manualPaused?'play':'pause')+'<span>'+(manualPaused?'Reproduzir':'Pausar')+'</span>';
    $('zc-pause').setAttribute('aria-label',manualPaused?'Reproduzir carrossel':'Pausar carrossel');paintIcons();
  }
  function moveRail(direction){
    if(track.children.length<2)return;
    manualPaused=true;updatePause();railOffset=0;
    if(direction>0)track.append(track.firstElementChild);else track.prepend(track.lastElementChild);
    track.style.transform='translateX(0)';
  }
  function animate(time){
    if(!root.isConnected)return;
    const delta=lastFrame?Math.min(time-lastFrame,50):0;lastFrame=time;
    if(!manualPaused&&!railHover&&!railFocus&&!currentId&&!document.hidden&&track.scrollWidth>rail.clientWidth){
      railOffset+=delta*.021;
      while(railOffset>=railStep()){railOffset-=railStep();track.append(track.firstElementChild);}
      track.style.transform='translateX('+-railOffset+'px)';
    }
    requestAnimationFrame(animate);
  }
  function updateOverlayHeight(){
    if($('zc-overlay').hidden)return;
    requestAnimationFrame(()=>{root.style.minHeight=Math.max(naturalHeight,$('zc-dialog').getBoundingClientRect().height+58)+'px';});
  }
  function showOverlay(){
    if($('zc-overlay').hidden){lastFocus=document.activeElement;naturalHeight=root.getBoundingClientRect().height;}
    $('zc-overlay').hidden=false;$('zc-app').inert=true;updateOverlayHeight();$('zc-dialog').scrollIntoView({block:'start',behavior:'instant'});$('zc-close').focus({preventScroll:true});
  }
  function closeOverlay(){
    $('zc-overlay').hidden=true;$('zc-app').inert=false;currentId=null;root.style.minHeight='';
    if(lastFocus&&lastFocus.isConnected)lastFocus.focus();else $('zc-search').focus();
  }
  function detailPair(label,value,wide=false){return '<div'+(wide?' class="zc-detail-wide"':'')+'><dt>'+label+'</dt><dd>'+esc(value||'Não informado')+'</dd></div>';}
  function channelGroup(label,items,iconName){return '<section><h4 class="zc-channel-heading">'+icon(iconName)+label+'</h4>'+items.map(item=>'<div class="zc-channel-item"><span>'+esc(item.label)+'</span><strong>'+esc(item.value||'Não informado')+'</strong></div>').join('')+'</section>';}
  function socialUI(c){
    return [{key:'linkedin',name:'LinkedIn',icon:'link'},{key:'instagram',name:'Instagram',icon:'camera'},{key:'facebook',name:'Facebook',icon:'contact-round'},{key:'website',name:'Site',icon:'globe'}].map(s=>{
      const has=!!c.social[s.key],slug=normalize(c.name).replace(/\s+/g,'.');
      const content=icon(s.icon)+'<span class="zc-social-copy"><strong>'+s.name+'</strong><small>'+(has?(s.key==='website'?esc(c.company):'@'+slug):'Não informado')+'</small></span>'+(has?icon('arrow-up-right'):'');
      return has?'<a class="zc-social cursor-interaction" href="'+esc(c.social[s.key])+'" target="_blank" rel="noopener noreferrer" aria-label="'+s.name+' de '+esc(c.name)+' — perfil demonstrativo em example.com">'+content+'</a>':'<div class="zc-social zc-social-unavailable">'+content+'</div>';
    }).join('');
  }
  function renderProfileTab(c){
    if(currentTab==='history'&&!c.events.length)return '<div class="zc-detail-group"><div class="zc-section-head"><h3>Histórico de relacionamento</h3></div><p class="zc-small-info">Nenhuma interação registrada neste contato demonstrativo.</p></div>';
    if(currentTab==='notes'&&!c.notes.length)return '<div class="zc-detail-group"><div class="zc-section-head"><h3>Anotações</h3></div><p class="zc-small-info">Nenhuma anotação disponível.</p></div>';
    if(currentTab==='singu')return '<section class="zc-detail-group"><div class="zc-section-head"><h3><span>'+icon('brain')+'</span>Perfil de relacionamento</h3></div><dl class="zc-detail-grid">'+detailPair('Foco profissional',c.department+' · '+c.role)+detailPair('Preferência de contato',c.id===1?'E-mail corporativo (exemplo)':'Não informada')+detailPair('Forma de decisão','Não informada')+detailPair('Motivações e objetivos','Não informados')+'</dl></section><section class="zc-detail-group"><div class="zc-section-head"><h3><span>'+icon('chart-no-axes-combined')+'</span>Modelos de perfil</h3></div><div class="zc-singu-models">'+['DISC','VAK','Big Five','MBTI','Eneagrama'].map(model=>'<div class="zc-singu-model"><strong>'+model+'</strong><span>Não avaliado</span></div>').join('')+'</div><p class="zc-profile-caption">Dados demonstrativos. Os campos são apresentados conforme o preenchimento no Singu.</p></section>';
    if(currentTab==='history')return '<div class="zc-section-head"><h3><span>'+icon('history')+'</span>Histórico de relacionamento</h3></div><div class="zc-timeline">'+c.events.map(e=>'<article class="zc-event"><span class="zc-event-icon">'+icon(e.icon)+'</span><time>'+esc(e.date)+'</time><h4>'+esc(e.title)+'</h4><p>'+esc(e.description)+'</p></article>').join('')+'</div>';
    if(currentTab==='notes')return '<div class="zc-section-head"><h3><span>'+icon('notebook-pen')+'</span>Anotações do relacionamento</h3></div>'+c.notes.map(n=>'<article class="zc-note-entry"><p>'+esc(n)+'</p><div class="zc-note-by"><span>Joaquim</span><span>Exemplo de anotação</span></div></article>').join('');
    return '<section class="zc-detail-group"><div class="zc-section-head"><h3><span>'+icon('briefcase-business')+'</span>Dados profissionais</h3></div><dl class="zc-detail-grid">'+detailPair('Empresa',c.company)+detailPair('Departamento',c.department)+detailPair('Cargo',c.role)+detailPair('Tipo de relacionamento',c.type)+'</dl><div class="zc-contact-channels">'+channelGroup('Telefones',c.phones||[{label:'Corporativo principal',value:c.phone}],'phone')+channelGroup('E-mails',c.emails||[{label:'Corporativo principal',value:c.email}],'mail')+'</div></section><section class="zc-detail-group"><div class="zc-section-head"><h3><span>'+icon('user-round')+'</span>Dados pessoais</h3></div><dl class="zc-detail-grid">'+detailPair('Nome completo',c.name)+detailPair('Aniversário',c.birthday)+detailPair('Cidade / Estado',c.city)+detailPair('Responsável pelo contato',c.owner)+detailPair('Endereço',c.address,true)+'</dl></section><section class="zc-detail-group"><div class="zc-section-head"><h3><span>'+icon('link')+'</span>Redes sociais e links</h3></div><div class="zc-socials">'+socialUI(c)+'</div><p class="zc-social-note">Perfis ilustrativos. Os links abrem example.com.</p></section><div class="zc-profile-bottom"><span>'+icon('clock-3')+'Última interação: '+esc(c.last)+'</span><span>Dados demonstrativos</span></div>';
  }
  function renderProfile(){
    const c=contacts.find(x=>x.id===currentId);if(!c)return;
    $('zc-dialog-context-label').textContent='Contatos / Ficha completa';
    const scope=filtered();$('zc-contact-prev').disabled=scope.length<2;$('zc-contact-next').disabled=scope.length<2;
    $('zc-dialog-content').innerHTML='<div class="zc-profile-grid"><aside class="zc-profile-aside"><div class="zc-profile-photo">'+photo(c,'zc-portrait')+typeBadge(c)+'</div><h2 class="zc-profile-name" id="zc-dialog-title">'+esc(c.name)+'</h2><p class="zc-profile-job">'+esc(c.role||'Cargo não informado')+'</p><div class="zc-profile-company">'+esc(c.company||'Empresa não informada')+'</div><div class="zc-profile-summary"><div>'+icon('map-pin')+'<span>'+esc(c.city||'Cidade não informada')+'</span></div><div>'+icon('phone')+'<span>'+esc(c.phone||'Telefone não informado')+'</span></div><div>'+icon('mail')+'<span data-tooltip="'+esc(c.email||'E-mail não informado')+'">'+esc(c.email||'E-mail não informado')+'</span></div></div><div class="zc-profile-source">'+icon('database')+'<span><small>Origem dos dados</small>Singu CRM</span></div></aside><div class="zc-profile-main"><div class="zc-profile-tabs" role="tablist" aria-label="Informações do contato">'+[['details','Visão geral','contact-round'],['singu','Perfil Singu','brain'],['history','Histórico','history'],['notes','Anotações','notebook-pen']].map(([id,label,tabIcon])=>'<button type="button" class="zc-profile-tab cursor-interaction" role="tab" id="zc-tab-'+id+'" data-tab="'+id+'" aria-controls="zc-profile-content" aria-selected="'+(currentTab===id)+'">'+icon(tabIcon)+label+'</button>').join('')+'</div><div id="zc-profile-content" role="tabpanel" aria-labelledby="zc-tab-'+currentTab+'">'+renderProfileTab(c)+'</div></div></div>';
    paintIcons();updateOverlayHeight();
  }
  function openContact(id){$('zc-contact-prev').hidden=false;$('zc-contact-next').hidden=false;currentId=Number(id);currentTab='details';renderProfile();showOverlay();}
  function nextContact(direction){const scope=filtered(),index=scope.findIndex(c=>c.id===currentId);if(!scope.length)return;currentId=scope[(index+direction+scope.length)%scope.length].id;currentTab='details';renderProfile();$('zc-live').textContent='Ficha de '+contacts.find(c=>c.id===currentId).name;}
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||!root.contains(button))return;
    if(button.dataset.open){openContact(button.dataset.open);return;}
    if(button.dataset.type){filter=button.dataset.type;page=0;renderFilters();renderGallery(true);root.querySelector('[data-type="'+CSS.escape(filter)+'"]')?.focus({preventScroll:true});return;}
    if(button.dataset.tab){currentTab=button.dataset.tab;renderProfile();$('zc-tab-'+currentTab).focus({preventScroll:true});return;}
    switch(button.id){
      case 'zc-close':closeOverlay();break;
      case 'zc-contact-prev':nextContact(-1);break;
      case 'zc-contact-next':nextContact(1);break;
      case 'zc-view-grid':view='grid';tableSort=null;page=0;renderGallery(true,false);break;
      case 'zc-view-list':view='list';tableSort=null;page=0;renderGallery(true,false);break;
      case 'zc-page-prev':page--;renderGallery(true,false);break;
      case 'zc-page-next':page++;renderGallery(true,false);break;
      case 'zc-clear-filters':filter='Todos';query='';advanced={company:'',role:'',tag:'',period:''};tableSort=null;$('zc-sort').value='name_asc';page=0;$('zc-search').value='';renderFilters();renderGallery(true);$('zc-search').focus({preventScroll:true});break;
      case 'zc-pause':manualPaused=!manualPaused;updatePause();break;
      case 'zc-rail-prev':moveRail(-1);break;
      case 'zc-rail-next':moveRail(1);break;
    }
  });
  $('zc-search').addEventListener('input',e=>{query=e.target.value;page=0;renderGallery(true);});
  $('zc-sort').addEventListener('change',()=>{tableSort=null;page=0;renderGallery(true);});
  $('zc-overlay').addEventListener('click',e=>{if(e.target===$('zc-overlay'))closeOverlay();});
  root.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&$('zc-overlay').hidden){event.preventDefault();$('zc-search').focus();}
    if(!$('zc-overlay').hidden){
      if(event.key==='Escape'){event.preventDefault();closeOverlay();return;}
      if(event.key==='Tab'){
        const focusable=Array.from($('zc-dialog').querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')).filter(el=>!el.hidden&&el.getClientRects().length);
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
      if(event.target.matches('[data-tab]')&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){
        event.preventDefault();const tabs=['details','singu','history','notes'];currentTab=tabs[(tabs.indexOf(currentTab)+(event.key==='ArrowRight'?1:3))%4];renderProfile();$('zc-tab-'+currentTab).focus({preventScroll:true});
      }
    }
  });
  rail.addEventListener('mouseenter',()=>{railHover=true;});rail.addEventListener('mouseleave',()=>{railHover=false;});
  rail.addEventListener('focusin',event=>{
    railFocus=true;manualPaused=true;updatePause();
    const item=event.target.closest('.zc-mini');if(!item)return;
    const itemRect=item.getBoundingClientRect(),railRect=rail.getBoundingClientRect();
    if(itemRect.left<railRect.left)railOffset=Math.max(0,railOffset-(railRect.left-itemRect.left));
    else if(itemRect.right>railRect.right)railOffset+=itemRect.right-railRect.right;
    track.style.transform='translateX('+-railOffset+'px)';
  });
  rail.addEventListener('focusout',()=>{setTimeout(()=>{railFocus=rail.contains(document.activeElement);},0);});
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(button&&root.contains(button)){
      if(button.dataset.closePop){closePopovers();return;}
      if(button.dataset.view){view=button.dataset.view;page=0;tableSort=null;closePopovers();renderGallery(true,false);return;}
      if(button.dataset.columns){columnCount=Number(button.dataset.columns);page=0;renderGallery(true,false);return;}
      if(button.dataset.tableSort){const key=button.dataset.tableSort;tableSort={key,direction:tableSort?.key===key?-tableSort.direction:1};renderGallery(true,false);return;}
      if(button.dataset.applyPreset){const preset=presets.find(p=>p.id===Number(button.dataset.applyPreset));if(preset){filter=preset.type;advanced={...preset.advanced};page=0;closePopovers();renderFilters();renderGallery(true);}return;}
      if(button.dataset.deletePreset){presets=presets.filter(p=>p.id!==Number(button.dataset.deletePreset));renderPresets();paintIcons();return;}
      switch(button.id){
        case 'zc-filter-toggle':togglePopover('zc-filter-pop',button);return;
        case 'zc-saved-toggle':togglePopover('zc-saved-pop',button);return;
        case 'zc-more-toggle':togglePopover('zc-more-pop',button);return;
        case 'zc-columns-toggle':togglePopover('zc-columns-pop',button);return;
        case 'zc-view-table':view='table';page=0;closePopovers();renderGallery(true,false);return;
        case 'zc-reset-advanced':advanced={company:'',role:'',tag:'',period:''};$('zc-sort').value='name_asc';tableSort=null;page=0;renderFilters();renderGallery(true);return;
        case 'zc-clear-selection':selected.clear();renderGallery(false,false);return;
        case 'zc-compare':closePopovers();showComparison();return;
      }
    }
    if(!event.target.closest('.zc-pop-wrap')&&!event.target.closest('.zc-popover'))closePopovers();
  });
  root.addEventListener('change',event=>{
    const target=event.target;
    if(target.dataset.select){const id=Number(target.dataset.select);if(target.checked)selected.add(id);else selected.delete(id);renderGallery(false,false);root.querySelector('[data-select="'+id+'"]')?.focus({preventScroll:true});return;}
    const filterKeys={'zc-filter-company':'company','zc-filter-role':'role','zc-filter-tag':'tag','zc-filter-period':'period'};
    if(filterKeys[target.id]){advanced[filterKeys[target.id]]=target.value;page=0;renderGallery(true);return;}
    if(target.id==='zc-legacy'){showLegacy=target.checked;page=0;renderFilters();renderGallery(true);return;}
    if(target.id==='zc-group-company'){groupByCompany=target.checked;page=0;renderGallery(true,false);return;}
    if(target.id==='zc-select-all'){const rows=visiblePageRows();if(target.checked)rows.forEach(c=>selected.add(c.id));else rows.forEach(c=>selected.delete(c.id));renderGallery(false,false);return;}
  });
  function savePreset(){
    if(!hasPresetCriteria())return;const name=$('zc-preset-name').value.trim();if(!name){$('zc-save-info').textContent='Dê um nome ao filtro para salvar.';$('zc-preset-name').setAttribute('aria-invalid','true');$('zc-preset-name').focus();return;}
    $('zc-preset-name').removeAttribute('aria-invalid');
    presets.push({id:nextPresetId++,name,type:filter,advanced:{...advanced}});$('zc-preset-name').value='';renderPresets();paintIcons();$('zc-live').textContent='Filtro '+name+' salvo nesta prévia.';
  }
  $('zc-save-current').addEventListener('click',savePreset);
  $('zc-preset-name').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();savePreset();}});
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&openPopover&&$('zc-overlay').hidden){event.preventDefault();const targetId=openPopover;closePopovers();root.querySelector('[aria-controls="'+targetId+'"]')?.focus({preventScroll:true});}});

  const observer=new ResizeObserver(()=>{const size=getSize();if(size!==layoutSize){page=0;renderGallery(false,false);}updateRailControls();updateOverlayHeight();});observer.observe(root);
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{if(e.matches){manualPaused=true;updatePause();}});
  layoutSize=getSize();renderFilters();renderGallery();updatePause();requestAnimationFrame(animate);
})();
