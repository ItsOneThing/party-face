export const lang = new URLSearchParams(location.search).get('lang') === 'it' ? 'it' : 'zh';
const messages = {
  zh: {
    title: '找到属于你的瞬间', tagline: '一起发生的故事，留给每一个你。', hero: '那天的快乐，<br>有<span class="handwritten">你的</span>一份。', intro: '合照里的笑容，镜头捕捉的小瞬间。<br>选一张自拍，把属于你的活动照片找回来。',
    defaultEvent: '迎新会 2026', eventCount: '活动照片 · 按人像查找', artCaption: '每一次相遇，都值得被记住。', local: '● 自拍在本机处理', start: '从一张自拍开始', instruction: '选一张正面、清晰、只有你自己的照片。', choose: '点击选择自拍', format: 'JPG、PNG 或 WebP · 最大 15 MB', album: '从相册选择 ↗', consent: '我同意用自己的自拍做人脸检索。自拍原图留在本机，人脸特征会发送到后端用于本次查询。', detail: '了解详情', search: '找我的照片', simple: '无需注册，无需安装 App。',
    guide: '三步，把回忆带走。', guide1: '选一张你的自拍', guide1p: '正面、光线充足的照片更容易找到你。', guide2: '找到有你的瞬间', guide2p: '只查询这场活动，单人照、合照一起找。', guide3: '去 Drive 带走原图', guide3p: '点击结果中的原图链接，查看或下载。', note: '第一次使用会加载识别模型。<br>没找到？换一张清晰的自拍再试试。',
    setup: '这是尚未连接活动数据的网站预览', setupp: '接入 Supabase 并导入照片后，就能真正开始查找。', demo: '查看结果界面示例 ↗', moments: '属于你的瞬间', reset: '换一张自拍 ↻', empty: '这次暂时没找到', emptyp: '试试另一张正面自拍。侧脸、遮挡或远处的小脸可能漏检。', more: '加载更多照片 ↓', contact: '有任何问题，可以找OneThing', credit: '照片来源：passion lab polimi摄影社', admin: '管理后台', privacy: '隐私说明', privacyTitle: '关于你的自拍',
    privacy1: '自拍原图在浏览器本地处理，不发送给服务器。浏览器生成的 128 或 512 维人脸特征会发送到活动查询接口，用于寻找相似人脸；应用不会将查询特征写入数据库，也不会主动记录自拍或查询特征。',
    privacy2: '后端保存的是提前从活动照片提取的人脸特征、照片信息和缩略图。活动链接可转发，上传自拍也不构成身份验证。匹配可能出现漏检或误匹配。',
    privacy3: 'Google Drive 原图遵循文件自身的分享和下载权限。网站关闭不会自动取消 Drive 分享。托管平台仍可能记录 IP、请求时间等运行日志。',
    privacy4: '如需关闭活动或删除活动索引，请联系活动组织者。请只使用自己的自拍。',
    invalidFile: '请选择 JPG、PNG 或 WebP。HEIC 可以截图后再选择。', tooLarge: '自拍最大 15 MB，请压缩后再选择。', change: '{size} MB · 可以点击更换', selected: '自拍已选好。确认同意后就可以开始查找。', selectedSetup: '自拍已选好；连接活动数据后才能查询。', unconfigured: '网站尚未连接后端。请先完成 Supabase 配置。', failed: '查询暂时失败，请稍后重试。', timeout: '查询超时，请稍后重试。', demoAlt: '界面示例插画，并非活动照片', demoBadge: '示例 · 非真实结果', original: '查看原图 ↗', brokenThumb: '缩略图暂时无法加载，请点击原图链接。', found: '找到 {count} 张可能有你的照片', resultDescription: '按人脸相似程度排序，结果可能包含误匹配。点击照片链接查看 Drive 原图。', noResultsDescription: '换一张正面、清晰的自拍，可能会找到更多。', shown: '已展示 {shown} / {total} 张照片。', noResults: '暂未找到匹配照片。', analyzing: '正在本机分析你的自拍…', noFace: '没有检测到清晰人脸，请换一张正面自拍。', manyFaces: '检测到多张人脸。请裁剪到只有你自己，再重新选择。', searching: '正在查找这场活动中有你的照片…', chooseAnother: '请选择另一张清晰自拍。', demoTitle: '结果界面示例', demoDescription: '以下是示意插画，不是你的活动照片，也没有进行人脸匹配。', sample: '回忆示例 {n}', preview: '当前为界面预览，尚未连接活动数据。', missingKey: '链接缺少活动访问码，请使用组织者发来的完整链接。', connecting: '正在连接活动…', photoCount: '{count} 张活动照片', preparing: '活动照片还在准备中，请稍后再来。', loadingModel: '正在加载识别模型，首次使用可能需要一些时间…', modelFailed: '识别资源加载失败，请检查网络或先运行模型下载工具。', hugeImage: '图片尺寸过大，请先压缩或截图后再试。', decodeFailed: '无法读取图片。iPhone 的 HEIC 照片请先转为 JPG，或截图后再选择。', serviceBusy: '查询服务暂时不可用，请稍后重试；持续失败请联系活动组织者。', rateLimit: '当前访问较多或今日查询额度已用完，请稍后再试或联系组织者。', closed: '活动不存在、尚未开放或已关闭。请联系组织者。', modelMismatch: '识别模型不匹配，请刷新页面或联系组织者。', invalidRequest: '请求无效，请刷新页面重试。', close: '关闭'
  },
  it: {
    title: 'Ritrova i tuoi momenti', tagline: 'Una storia insieme. Un ricordo per ognuno.', hero: 'Quel giorno,<br>c’eri anche <span class="handwritten">tu.</span>', intro: 'I sorrisi di gruppo, gli attimi colti al volo.<br>Scegli un selfie e ritrova le foto dell’evento in cui ci sei.',
    defaultEvent: 'Festa di benvenuto 2026', eventCount: 'Foto dell’evento · Ricerca per volto', artCaption: 'Ogni incontro merita un ricordo.', local: '● Selfie elaborato sul dispositivo', start: 'Tutto inizia da un selfie', instruction: 'Scegli una foto nitida e frontale, con solo il tuo volto.', choose: 'Scegli un selfie', format: 'JPG, PNG o WebP · Massimo 15 MB', album: 'Scegli dalla galleria ↗', consent: 'Acconsento alla ricerca tramite il mio volto. Il selfie resta sul dispositivo; i dati del volto vengono inviati al servizio per questa ricerca.', detail: 'Scopri di più', search: 'Trova le mie foto', simple: 'Nessun account. Nessuna app da installare.',
    guide: 'Tre passi. I tuoi ricordi.', guide1: 'Scegli un tuo selfie', guide1p: 'Una foto frontale e ben illuminata aiuta a riconoscerti.', guide2: 'Ritrova i tuoi momenti', guide2p: 'Cerca solo in questo evento, anche nelle foto di gruppo.', guide3: 'Scarica gli originali da Drive', guide3p: 'Apri il link della foto per visualizzarla o scaricarla.', note: 'Al primo utilizzo viene caricato il modello.<br>Nessun risultato? Prova un selfie più nitido.',
    setup: 'Anteprima: le foto dell’evento non sono ancora collegate', setupp: 'La ricerca sarà disponibile dopo la configurazione e l’importazione.', demo: 'Vedi un esempio dei risultati ↗', moments: 'I tuoi momenti', reset: 'Cambia selfie ↻', empty: 'Nessuna foto trovata per ora', emptyp: 'Prova un altro selfie frontale. Volti lontani, coperti o di profilo possono non essere riconosciuti.', more: 'Carica altre foto ↓', contact: 'Per qualsiasi problema, contatta OneThing', credit: 'Foto: passion lab polimi摄影社 · club di fotografia', admin: 'Area amministratori', privacy: 'Privacy', privacyTitle: 'Il tuo selfie e la tua privacy',
    privacy1: 'Il selfie viene elaborato nel browser e l’immagine originale non viene inviata al server. Una rappresentazione numerica del volto (128 o 512 valori) viene inviata al servizio per cercare volti simili. L’applicazione non salva questi dati di ricerca nel database né registra intenzionalmente selfie o rappresentazioni del volto ricevute.',
    privacy2: 'Il servizio conserva i dati dei volti estratti in anticipo dalle foto dell’evento, le informazioni sulle foto e le miniature. Il link può essere inoltrato e un selfie non verifica l’identità. I risultati possono contenere errori o omettere alcune foto.',
    privacy3: 'Gli originali su Google Drive seguono le autorizzazioni dei singoli file. Chiudere l’evento sul sito non revoca la condivisione su Drive. I fornitori di hosting possono registrare indirizzi IP, orari e altri dati tecnici.',
    privacy4: 'Per chiudere l’evento o richiedere la cancellazione dell’indice, contatta l’organizzatore. Usa solo un tuo selfie.',
    invalidFile: 'Scegli un JPG, PNG o WebP. Per una foto HEIC puoi usare uno screenshot.', tooLarge: 'Il limite è 15 MB. Riduci la dimensione del selfie e riprova.', change: '{size} MB · Tocca per cambiare', selected: 'Selfie selezionato. Conferma il consenso per iniziare.', selectedSetup: 'Selfie selezionato; la ricerca sarà disponibile quando l’evento sarà collegato.', unconfigured: 'Il servizio non è ancora configurato. Completa la configurazione Supabase.', failed: 'Ricerca non riuscita. Riprova tra poco.', timeout: 'La ricerca ha impiegato troppo tempo. Riprova tra poco.', demoAlt: 'Illustrazione dimostrativa, non una foto dell’evento', demoBadge: 'Esempio · Non è un risultato reale', original: 'Apri originale ↗', brokenThumb: 'Miniatura non disponibile. Apri il link dell’originale.', found: '{count} foto in cui potresti esserci', resultDescription: 'Ordinate per somiglianza del volto. I risultati possono contenere errori. Apri gli originali su Drive.', noResultsDescription: 'Prova un selfie frontale e nitido: potresti trovare altre foto.', shown: '{shown} foto mostrate su {total}.', noResults: 'Nessuna corrispondenza trovata.', analyzing: 'Analisi del selfie sul tuo dispositivo…', noFace: 'Nessun volto nitido rilevato. Prova un selfie frontale.', manyFaces: 'Sono stati rilevati più volti. Ritaglia la foto lasciando solo il tuo volto.', searching: 'Ricerca nelle foto di questo evento…', chooseAnother: 'Scegli un altro selfie nitido.', demoTitle: 'Esempio della pagina dei risultati', demoDescription: 'Queste sono illustrazioni dimostrative. Non sono foto dell’evento e non è stata eseguita alcuna ricerca.', sample: 'Ricordo di esempio {n}', preview: 'Anteprima dell’interfaccia: l’evento non è ancora collegato.', missingKey: 'Manca il codice di accesso. Usa il link completo fornito dall’organizzatore.', connecting: 'Connessione all’evento…', photoCount: '{count} foto dell’evento', preparing: 'Le foto sono ancora in preparazione. Torna tra poco.', loadingModel: 'Caricamento del modello. Al primo utilizzo può richiedere un po’ di tempo…', modelFailed: 'Impossibile caricare il modello. Controlla la connessione o contatta l’organizzatore.', hugeImage: 'L’immagine è troppo grande. Riducila o usa uno screenshot.', decodeFailed: 'Impossibile leggere la foto. Converti le immagini HEIC in JPG oppure usa uno screenshot.', serviceBusy: 'Il servizio non è disponibile. Riprova tra poco o contatta l’organizzatore.', rateLimit: 'Molte richieste o limite giornaliero raggiunto. Riprova più tardi o contatta l’organizzatore.', closed: 'Evento non disponibile, non ancora aperto o chiuso. Contatta l’organizzatore.', modelMismatch: 'Il modello non corrisponde a quello dell’evento. Aggiorna la pagina o contatta l’organizzatore.', invalidRequest: 'Richiesta non valida. Aggiorna la pagina e riprova.', close: 'Chiudi'
  }
};
Object.assign(messages.zh, {
  eventIntro: '用一张自拍找到有你的照片，也可以浏览这场活动的全部瞬间。',
  start: '用自拍，找到你的活动照片', tabSearch: '自拍找照片', tabBrowse: '浏览全部照片', newFeature: '新功能',
  fallbackBrowse: '识别遇到问题？直接浏览全部照片 →', emptyBrowse: '浏览全部照片 →',
  resultFallback: '还没找全？你也可以浏览全部照片。', openGallery: '打开完整相册 →',
  browseEyebrow: 'THE COMPLETE GALLERY', browseTitle: '这场活动的所有瞬间',
  browseDescription: '不用自拍，按分类浏览。点开照片放大，再到 Drive 下载原图。', trySearch: '试试自拍查找 ↗',
  galleryDemo: '这是界面示例，展示的是插画，不是真实活动照片。', albumFilter: '照片分类', filenameFilter: '按文件名查找（可选）',
  filenamePlaceholder: '例如 A14', filter: '筛选', allAlbums: '全部分类', rootAlbum: '其他照片',
  activityAlbum: '活动', teamAlbum: '工作组', sponsorAlbum: '赞助', galleryCount: '{count} 张照片',
  galleryLoading: '正在加载相册…', galleryUnavailable: '相册暂时无法加载。请重试或打开 Drive 相册。',
  refreshGallery: '刷新照片 ↻', liveGallery: '自动检查新照片（每 30 秒）', galleryUpdated: '照片已更新', galleryChecking: '正在检查新照片…', livePaused: '自动更新已暂停，请点击刷新重试。',
  galleryEmpty: '没有找到符合筛选的照片', galleryEmptyDescription: '换一个分类或清除文件名筛选试试。', clearFilters: '清除筛选',
  galleryErrorTitle: '相册暂时无法加载', galleryErrorDescription: '可以重试；如果网站服务暂时不可用，也可以直接打开原始 Drive 相册。',
  retry: '重新加载', driveAlbum: '打开 Drive 相册 ↗', openPhoto: '放大查看 {name}', enlarge: '放大查看',
  viewerNote: '这是预览图，完整画质请打开 Drive 原图。', viewerOriginal: '查看或下载原图 ↗',
  previousPhoto: '上一张', nextPhoto: '下一张', closePhoto: '关闭照片预览',
  galleryOnly: '照片已可浏览；自拍索引还未准备完成。',
  privacy2: '后端保存提前从活动照片提取的人脸特征、照片信息和缩略图。持有活动链接的人可以浏览本场活动的全部已导入照片，或使用自拍查找。链接可转发，自拍不构成身份验证；匹配可能出现漏检或误匹配。'
});
Object.assign(messages.it, {
  eventIntro: 'Ritrova le foto in cui ci sei con un selfie, oppure sfoglia tutti i momenti dell’evento.',
  start: 'Trova le tue foto con un selfie', tabSearch: 'Le mie foto', tabBrowse: 'Tutte le foto', newFeature: 'Novità',
  fallbackBrowse: 'La ricerca non funziona? Sfoglia tutte le foto →', emptyBrowse: 'Sfoglia tutte le foto →',
  resultFallback: 'Manca qualche scatto? Puoi anche sfogliare tutte le foto.', openGallery: 'Apri la galleria completa →',
  browseEyebrow: 'LA GALLERIA COMPLETA', browseTitle: 'Tutti i momenti dell’evento',
  browseDescription: 'Nessun selfie necessario. Scegli una categoria, ingrandisci le foto e apri gli originali su Drive.', trySearch: 'Prova la ricerca con un selfie ↗',
  galleryDemo: 'Anteprima: queste sono illustrazioni dimostrative, non foto reali dell’evento.', albumFilter: 'Categoria', filenameFilter: 'Nome del file (facoltativo)',
  filenamePlaceholder: 'Ad esempio A14', filter: 'Filtra', allAlbums: 'Tutte le categorie', rootAlbum: 'Altre foto',
  activityAlbum: 'Attività', teamAlbum: 'Team', sponsorAlbum: 'Sponsor', galleryCount: '{count} foto',
  galleryLoading: 'Caricamento della galleria…', galleryUnavailable: 'Galleria non disponibile. Riprova oppure apri l’album su Drive.',
  refreshGallery: 'Aggiorna le foto ↻', liveGallery: 'Controlla nuove foto ogni 30 secondi', galleryUpdated: 'Foto aggiornate', galleryChecking: 'Controllo delle nuove foto…', livePaused: 'Aggiornamento automatico in pausa. Premi Aggiorna per riprovare.',
  galleryEmpty: 'Nessuna foto corrisponde ai filtri', galleryEmptyDescription: 'Prova un’altra categoria o cancella il filtro per nome.', clearFilters: 'Cancella i filtri',
  galleryErrorTitle: 'La galleria non è disponibile', galleryErrorDescription: 'Puoi riprovare. Se il sito non è disponibile, puoi anche aprire l’album originale su Drive.',
  retry: 'Riprova', driveAlbum: 'Apri l’album su Drive ↗', openPhoto: 'Ingrandisci {name}', enlarge: 'Ingrandisci',
  viewerNote: 'Questa è un’anteprima. Per la qualità completa, apri l’originale su Drive.', viewerOriginal: 'Apri o scarica l’originale ↗',
  previousPhoto: 'Foto precedente', nextPhoto: 'Foto successiva', closePhoto: 'Chiudi l’anteprima',
  galleryOnly: 'Puoi già sfogliare le foto. L’indice per la ricerca con selfie non è ancora pronto.',
  privacy2: 'Il servizio conserva i dati dei volti estratti dalle foto dell’evento, le informazioni sulle foto e le miniature. Chi possiede il link può sfogliare tutte le foto importate di questo evento o cercare con un selfie. Il link può essere inoltrato e un selfie non verifica l’identità. I risultati possono contenere errori o omettere alcune foto.'
});
export function t(key, values = {}) { let text = messages[lang][key] || messages.zh[key] || key; for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{${name}}`, String(value)); return text; }
export function localizedError(error) {
  const original = error?.message || String(error);
  if (Object.values(messages[lang]).includes(original)) return original;
  const key = Object.keys(messages.zh).find(k => messages.zh[k] === original);
  return key ? t(key) : t('failed');
}
export function initLanguage() {
  document.documentElement.lang = lang === 'it' ? 'it' : 'zh-CN';
  document.title = `partyface · ${t('title')}`;
  const texts = {
    '.header-note': 'tagline', '.hero h1': 'defaultEvent', '.intro': 'eventIntro', '#event-pill': 'defaultEvent', '#event-title': 'defaultEvent', '#event-count': 'eventCount', '.art-caption': 'artCaption', '.local-pill': 'local', '.search-card h2': 'start', '.card-description': 'instruction', '#file-label': 'choose', '#file-hint': 'format', '.choose-tag': 'album', '#privacy-button': 'detail', '#search-button span:first-child': 'search', '.how-card h2': 'guide', '.how-card li:nth-child(1) strong': 'guide1', '.how-card li:nth-child(1) p': 'guide1p', '.how-card li:nth-child(2) strong': 'guide2', '.how-card li:nth-child(2) p': 'guide2p', '.how-card li:nth-child(3) strong': 'guide3', '.how-card li:nth-child(3) p': 'guide3p', '.side-note p': 'note', '#setup-banner strong': 'setup', '#setup-banner p': 'setupp', '#demo-button': 'demo', '#results-title': 'moments', '#reset-button': 'reset', '#empty-result h3': 'empty', '#empty-result p': 'emptyp', '#more-button': 'more', '#footer-contact': 'contact', '#footer-credit': 'credit', '#footer-admin': 'admin', '#footer-privacy': 'privacy', '#privacy-dialog h2': 'privacyTitle', '#privacy-dialog p:nth-of-type(2)': 'privacy1', '#privacy-dialog p:nth-of-type(3)': 'privacy2', '#privacy-dialog p:nth-of-type(4)': 'privacy3', '#privacy-dialog p:nth-of-type(5)': 'privacy4',
    '#tab-search-label': 'tabSearch', '#tab-browse-label': 'tabBrowse', '#new-feature': 'newFeature', '#fallback-browse': 'fallbackBrowse', '#empty-browse': 'emptyBrowse', '#result-fallback-label': 'resultFallback', '#result-browse': 'openGallery', '#browse-eyebrow': 'browseEyebrow', '#browse-title': 'browseTitle', '#browse-description': 'browseDescription', '#browse-to-search': 'trySearch', '#browse-demo-notice': 'galleryDemo', '#album-label': 'albumFilter', '#filename-label': 'filenameFilter', '#filter-submit': 'filter', '#browse-empty-title': 'galleryEmpty', '#browse-empty-description': 'galleryEmptyDescription', '#clear-filters': 'clearFilters', '#browse-more': 'more', '#browse-error-title': 'galleryErrorTitle', '#browse-error-description': 'galleryErrorDescription', '#browse-retry': 'retry', '#drive-folder-link': 'driveAlbum', '#viewer-note': 'viewerNote', '#viewer-original': 'viewerOriginal'
  };
  texts['#browse-refresh'] = 'refreshGallery'; texts['#browse-live-label'] = 'liveGallery';
  for (const [selector, key] of Object.entries(texts)) { const el = document.querySelector(selector); if (el) el.innerHTML = t(key); }
  const consent = document.querySelector('.consent span');
  if (consent) consent.firstChild.textContent = t('consent') + ' ';
  document.getElementById('close-privacy').setAttribute('aria-label', t('close'));
  const toggle = document.getElementById('language-toggle');
  document.getElementById('filename-filter').placeholder = t('filenamePlaceholder');
  document.getElementById('viewer-close').setAttribute('aria-label', t('closePhoto'));
  document.getElementById('viewer-prev').setAttribute('aria-label', t('previousPhoto'));
  document.getElementById('viewer-next').setAttribute('aria-label', t('nextPhoto'));
  if (lang === 'it') {
    document.querySelector('.photo-tabs').setAttribute('aria-label', 'Modalità di ricerca delle foto');
    document.querySelector('.search-layout').setAttribute('aria-label', 'Trova le foto con un selfie');
    document.getElementById('selfie-preview').alt = 'Anteprima del selfie selezionato';
  }
  toggle.textContent = lang === 'it' ? '中文' : 'Italiano';
  toggle.addEventListener('click', () => { const url = new URL(location.href); url.searchParams.set('lang', lang === 'it' ? 'zh' : 'it'); location.href = url.href; });
}
