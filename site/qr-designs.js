/* Shared, printable QR card studio. Preferences contain presentation only. */
(function(root){
'use strict';
const themes={
 review:[
 {id:'blue-glass',name:'Google Blue Glass',detail:'Google colours · blue glass',bg:'#edf5ff',ink:'#17304f',muted:'#526e8a',accent:'#427aad',line:'#bfd0e1',layout:'glass',font:'Arial, sans-serif',qrInk:'#16364d'},
 {id:'navy',name:'Signature Navy',detail:'Deep navy · clean typography',bg:'#10243e',ink:'#f1f6ff',muted:'#b9ccdf',accent:'#a8c9ec',line:'#405b77',layout:'center',font:'Arial, sans-serif',qrInk:'#10243e'},
 {id:'platinum',name:'Google Platinum',detail:'Google identity · silver white',bg:'#f5f7fa',ink:'#233245',muted:'#647486',accent:'#415972',line:'#d0d7e0',layout:'band',font:'Arial, sans-serif',qrInk:'#233245'},
 {id:'ivory',name:'Ivory Professional',detail:'Google reviews · warm neutral',bg:'#faf6ee',ink:'#353126',muted:'#7a715f',accent:'#8f7551',line:'#d8cbb6',layout:'editorial',font:'Georgia, serif',qrInk:'#353126'},
 {id:'minimal',name:'Google White',detail:'Google colours · crisp white',bg:'#ffffff',ink:'#192b3f',muted:'#637488',accent:'#335678',line:'#d8e0e8',layout:'minimal',font:'Arial, sans-serif',qrInk:'#192b3f'},
 {id:'onyx',name:'Onyx & Gold',detail:'Charcoal · fine gold border',bg:'#191c21',ink:'#f4ead6',muted:'#c2b69e',accent:'#cfb475',line:'#786a49',layout:'frame',font:'Georgia, serif',qrInk:'#191c21'}
 ],
 restaurant:[
 {id:'glass-bistro',name:'Bistro Glass',detail:'Warm charcoal · contemporary',bg:'#202a29',ink:'#f4f2e8',muted:'#c2c9bf',accent:'#d4b58b',line:'#67736a',layout:'glass',font:'Arial, sans-serif',qrInk:'#202a29'},
 {id:'garden',name:'Garden Table',detail:'Sage & cream · natural',bg:'#f1f5ea',ink:'#294133',muted:'#65785e',accent:'#708665',line:'#c7d2ba',layout:'editorial',font:'Georgia, serif',qrInk:'#294133'},
 {id:'heritage',name:'Spice & Heritage',detail:'Saffron · traditional border',bg:'#faf0df',ink:'#493522',muted:'#82694b',accent:'#a37b37',line:'#d4bb8f',layout:'frame',font:'Georgia, serif',qrInk:'#493522'},
 {id:'coastal',name:'Coastal Blue',detail:'Sea blue · open & fresh',bg:'#edf7fa',ink:'#234757',muted:'#597d8b',accent:'#4f8fa7',line:'#bdd6df',layout:'band',font:'Arial, sans-serif',qrInk:'#234757'},
 {id:'midnight',name:'Midnight Dining',detail:'Ink & champagne · fine dining',bg:'#111d2d',ink:'#f3e8d0',muted:'#c2b79f',accent:'#c3ab75',line:'#6d664f',layout:'frame',font:'Georgia, serif',qrInk:'#111d2d'},
 {id:'cafe',name:'Café Cream',detail:'Coffee & cream · soft panel',bg:'#faf2e8',ink:'#4a3427',muted:'#856c58',accent:'#a17c58',line:'#dbc7b1',layout:'glass',font:'Georgia, serif',qrInk:'#4a3427'}
 ]
};
const instances=new WeakMap();
const patterns=[
 {id:'original',name:'Signature rounded',type:'extra-rounded'},
 {id:'square',name:'Classic square',type:'square'},
 {id:'rounded',name:'Soft square',type:'rounded'},
 {id:'dots',name:'Dot pattern',type:'dots'}
];
const xml=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const kindOf=kind=>kind==='restaurant'?'restaurant':'review';
const catalogue=kind=>themes[kindOf(kind)];
function preferences(config,input){
 const list=catalogue(config.kind);
 const fallback=list.some(t=>t.id===config.defaultTheme)?config.defaultTheme:list[0].id;
 return {theme:list.some(t=>t.id===input?.theme)?input.theme:fallback,pattern:patterns.some(p=>p.id===input?.pattern)?input.pattern:(kindOf(config.kind)==='review'?'original':'rounded')};
}
function themeFor(config,prefs){return catalogue(config.kind).find(t=>t.id===preferences(config,prefs).theme);}
function keyFor(config){return 'qr-card-design:v1:'+kindOf(config.kind)+':'+String(config.id);}
function readPreference(config){try{return preferences(config,JSON.parse(root.localStorage.getItem(keyFor(config))||'null'));}catch{return preferences(config,null);}}
function savePreference(config,prefs){try{root.localStorage.setItem(keyFor(config),JSON.stringify(preferences(config,prefs)));return true;}catch{return false;}}
function validateURL(value){const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Use a valid website link for this QR.');return u.href;}
function qrOptions(config,prefs,size=760){
 const p=preferences(config,prefs),t=themeFor(config,p),original=p.pattern==='original';
 return {width:size,height:size,type:'svg',data:validateURL(config.url),margin:Math.ceil(size*4/29),
 qrOptions:{errorCorrectionLevel:'H'},dotsOptions:original?{type:'extra-rounded',gradient:{type:'linear',rotation:Math.PI/4,colorStops:[{offset:0,color:'#07111f'},{offset:.55,color:'#173b70'},{offset:1,color:'#0f5a67'}]}}:{type:patterns.find(s=>s.id===p.pattern).type,color:t.qrInk},
 cornersSquareOptions:{type:original?'extra-rounded':'square',color:original?'#2563eb':t.qrInk},
 cornersDotOptions:{type:original?'dot':'square',color:original?'#07111f':t.qrInk},
 backgroundOptions:{color:'#ffffff'}};
}
function weight(c){return /\s/.test(c)?.28:/[MW@]/.test(c)?.93:/[mw]/.test(c)?.84:/[ilI.,:;!'|]/.test(c)?.27:/[A-Z0-9]/.test(c)?.65:c.codePointAt(0)>255?.94:.53;}
function wrapText(value,width,size,maxLines=3){
 const words=String(value||'').trim().replace(/\s+/g,' ').split(' '),lines=[];let line='';
 const measure=s=>Array.from(s).reduce((n,c)=>n+weight(c)*size,0);
 for(const word of words){let chunks=[''];for(const c of Array.from(word)){if(measure(chunks[chunks.length-1]+c)>width)chunks.push('');chunks[chunks.length-1]+=c;}
  for(const part of chunks){const next=line?line+' '+part:part;if(measure(next)>width&&line){lines.push(line);line=part;}else line=next;}
 }
 if(line)lines.push(line);if(lines.length>maxLines){lines.length=maxLines;while(measure(lines[maxLines-1]+'…')>width)lines[maxLines-1]=lines[maxLines-1].slice(0,-1);lines[maxLines-1]+='…';}
 return lines;
}
function textLines(lines,x,y,size,color,font,anchor='middle',weightValue=400,gap=1.22){
 return lines.map((line,i)=>'<text x="'+x+'" y="'+(y+i*size*gap)+'" fill="'+color+'" font-family="'+xml(font)+'" font-size="'+size+'" font-weight="'+weightValue+'" text-anchor="'+anchor+'">'+xml(line)+'</text>').join('');
}

function reviewCardSVG(config,qrSVG,prefs){
 const t=themeFor(config,prefs),name=String(config.name||'Your business'),company=String(config.company||'YAM IT SERVICES'),id=String(config.code||config.id||'').slice(0,36);
 const embedded=String(qrSVG).replace(/<\?xml[\s\S]*?\?>/g,'').replace(/<!DOCTYPE[^>]*>/g,'').replace(/<svg\b[^>]*>/,'<svg x="165" y="645" width="570" height="570" viewBox="0 0 760 760" xmlns="http://www.w3.org/2000/svg">');
 if(!embedded.includes('<svg '))throw Error('The QR could not be rendered. Please try again.');
 const nameLines=wrapText(name,744,48,2);
 const google='<g aria-label="Google" font-family="Arial,sans-serif" font-size="65" font-weight="600">'+[['G',251,'#4285f4'],['o',303,'#ea4335'],['o',344,'#fbbc05'],['g',385,'#4285f4'],['l',427,'#34a853'],['e',444,'#ea4335']].map(([c,x,color])=>'<text x="'+x+'" y="142" fill="'+color+'">'+c+'</text>').join('')+'<text x="496" y="142" fill="'+t.ink+'" font-size="45" font-weight="400">reviews</text></g>';
 const stars=Array.from({length:5},(_,i)=>'<path transform="translate('+(321+i*57)+' 421) scale(1.7)" d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8l-6.2 3.3 1.2-6.9-5-4.9 6.9-1z" fill="none" stroke="#e9b837" stroke-width="1.4"/>').join('');
 const backdrop=t.layout==='frame'?'<rect x="28" y="28" width="844" height="1371" rx="24" fill="none" stroke="'+t.accent+'" stroke-width="2"/>':t.layout==='glass'?'<path d="M0 0H900V330L0 580Z" fill="#4285f4" opacity=".06"/><circle cx="850" cy="200" r="180" fill="#4285f4" opacity=".05"/>':t.layout==='band'?'<rect x="0" y="0" width="900" height="190" fill="#4285f4" opacity=".05"/>':'';
 return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1427" viewBox="0 0 900 1427" role="img" aria-label="'+xml(name+' GOOGLE REVIEWS QR card')+'" data-company-name="'+xml(company)+'"><title>'+xml(name+' · GOOGLE REVIEWS · '+t.name)+'</title><rect width="900" height="1427" rx="22" fill="'+t.bg+'"/>'+backdrop+
 '<text x="827" y="70" text-anchor="end" font-family="Arial,sans-serif" font-size="19" fill="'+t.muted+'">'+xml(id)+'</text>'+google+
 textLines(['Review us on Google'],450,245,55,t.ink,'Arial,sans-serif','middle',700)+
 '<path d="M330 278H570" stroke="'+t.line+'" stroke-width="2"/>'+
 textLines(nameLines,450,340,48,t.ink,'Arial,sans-serif','middle',600,1.14)+
 '<g aria-label="Share your rating">'+stars+'</g>'+
 textLines(['Your experience matters.'],450,510,30,t.ink,'Arial,sans-serif','middle',600)+
 textLines(['Open your camera and scan the code.','Leave your honest review on Google.'],450,552,24,t.muted,'Arial,sans-serif','middle',400,1.35)+
 '<rect x="140" y="620" width="620" height="620" rx="24" fill="#ffffff" stroke="'+t.line+'" stroke-width="2"/>'+embedded+
 '<text x="450" y="1282" text-anchor="middle" fill="'+t.ink+'" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="2">SCAN TO REVIEW</text>'+
 '<path d="M100 1305H800" stroke="'+t.line+'" stroke-width="2"/>'+
 '<text x="450" y="1336" text-anchor="middle" fill="'+t.muted+'" font-family="Arial,sans-serif" font-size="19" letter-spacing="2">POWERED BY</text>'+
 textLines(wrapText(company,744,34,2),450,1377,34,t.ink,'Arial,sans-serif','middle',800,1.08)+
 '<path d="M95 1423H272" stroke="#4285f4" stroke-width="8"/><path d="M272 1423H450" stroke="#ea4335" stroke-width="8"/><path d="M450 1423H627" stroke="#fbbc05" stroke-width="8"/><path d="M627 1423H805" stroke="#34a853" stroke-width="8"/></svg>';
}

function cardSVG(config,qrSVG,prefs){
 if(kindOf(config.kind)==='review')return reviewCardSVG(config,qrSVG,prefs);
 const kind=kindOf(config.kind),p=preferences(config,prefs),t=themeFor(config,p),restaurant=kind==='restaurant',height=restaurant?1269:1427;
 const heading=restaurant?'Welcome to our table':'Share your experience';
 const copy=restaurant?[config.features?.length?config.features.slice(0,5).join(' · '):'Explore our menu and guest connections.','Everything for your visit, in one scan.']:['Open your camera and scan the code.','Leave your honest review on Google.'];
 const band=t.layout==='band',editorial=t.layout==='editorial',name=String(config.name||config.company||'Your business');
 const topInk=band?'#ffffff':t.ink,topMuted=band?'#e5edf5':t.muted;
 let decoration='';
 if(band)decoration='<path d="M0 0H900V'+(restaurant?'295':'385')+'H0Z" fill="'+t.accent+'"/>';
 if(t.layout==='frame')decoration='<rect x="27" y="27" width="846" height="'+(height-54)+'" rx="8" fill="none" stroke="'+t.accent+'" stroke-width="2"/><rect x="40" y="40" width="820" height="'+(height-80)+'" rx="4" fill="none" stroke="'+t.line+'"/>';
 if(t.layout==='glass')decoration='<path d="M0 0H900V330L0 560Z" fill="'+t.accent+'" opacity=".09"/><rect x="52" y="152" width="796" height="222" rx="24" fill="#ffffff" opacity=".065" stroke="'+t.line+'" stroke-width="2"/>';
 if(editorial)decoration='<path d="M72 175V365" stroke="'+t.accent+'" stroke-width="4"/>';
 const qrTop=restaurant?490:620,qrSize=620,inner=570,qrX=165,innerY=qrTop+25;
 const embedded=String(qrSVG).replace(/<\?xml[\s\S]*?\?>/g,'').replace(/<!DOCTYPE[^>]*>/g,'').replace(/<svg\b[^>]*>/,'<svg x="'+qrX+'" y="'+innerY+'" width="'+inner+'" height="'+inner+'" viewBox="0 0 760 760" xmlns="http://www.w3.org/2000/svg">');
 if(!embedded.includes('<svg '))throw Error('The QR could not be rendered. Please try again.');
 const nameLines=wrapText(name,editorial?700:748,58,restaurant?2:3),titleY=restaurant?354:436;
 const context=restaurant?'RESTAURANT MENU':'GOOGLE REVIEWS';
 const id=String(config.code||config.id||'').slice(0,36);
 return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="'+height+'" viewBox="0 0 900 '+height+'" role="img" aria-label="'+xml(name+' '+context+' QR card')+'"><title>'+xml(name+' · '+context+' · '+t.name)+'</title>'+
 '<rect width="900" height="'+height+'" rx="18" fill="'+t.bg+'"/>'+decoration+
 '<text x="73" y="94" fill="'+topInk+'" font-family="Arial, sans-serif" font-size="26" font-weight="700" letter-spacing="2">'+context+'</text>'+
 '<text x="827" y="94" fill="'+topMuted+'" font-family="Arial, sans-serif" font-size="21" text-anchor="end">'+xml(id)+'</text>'+
 '<path d="M73 129H827" stroke="'+(band?'#ffffff55':t.line)+'" stroke-width="2"/>'+
 textLines(nameLines,editorial?100:450,restaurant?190:225,58,topInk,t.font,editorial?'start':'middle',t.font.includes('Georgia')?400:600,1.14)+
 textLines(wrapText(heading,740,42,2),450,titleY,42,t.ink,t.font,'middle',500)+
 textLines(copy,450,restaurant?416:501,25,t.muted,'Arial, sans-serif','middle',400,1.3)+
 '<rect x="140" y="'+qrTop+'" width="'+qrSize+'" height="'+qrSize+'" rx="'+(t.layout==='minimal'||editorial?'4':'16')+'" fill="#ffffff" stroke="'+t.line+'" stroke-width="2"/>'+embedded+
 '<text x="450" y="'+(restaurant?1160:1290)+'" fill="'+t.ink+'" font-family="Arial, sans-serif" font-size="25" font-weight="600" letter-spacing="2" text-anchor="middle">'+(restaurant?'SCAN TO EXPLORE':'SCAN TO REVIEW')+'</text>'+
 '<path d="M73 '+(restaurant?1200:1330)+'H827" stroke="'+t.line+'" stroke-width="2"/>'+
 textLines(wrapText(config.company?'Powered by '+config.company:(restaurant?'A warm welcome. No app needed.':'Your feedback helps this business.'),744,22,1),450,restaurant?1244:1380,22,t.muted,'Arial, sans-serif')+'</svg>';
}
function filename(config,prefs,extension){const p=preferences(config,prefs);return (String(config.code||config.id||config.name||'qr-card').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'qr-card')+'-'+kindOf(config.kind)+'-'+p.theme+'-'+p.pattern+'.'+extension;}
function editorMarkup(config){
 const p=readPreference(config),readOnly=!!config.readOnly;
 return '<section class="qr-design-studio" aria-label="'+(kindOf(config.kind)==='review'?'Google review':'Restaurant')+' QR card designer"><div class="studio-layout"><div class="studio-controls"><span class="studio-eyebrow">QR CARD DESIGN</span><h3>Choose a card you’re proud to display.</h3><p class="studio-copy">Six considered themes. Four QR patterns. Your existing QR link stays the same.</p>'+
 '<fieldset class="studio-fieldset"><legend>Card theme</legend><div class="studio-theme-grid">'+catalogue(config.kind).map(t=>'<button type="button" class="studio-theme '+(p.theme===t.id?'selected':'')+'" data-card-theme="'+t.id+'" aria-pressed="'+(p.theme===t.id)+'" '+(readOnly?'disabled':'')+'><span class="studio-swatch" style="background:'+t.bg+';color:'+t.ink+';border-color:'+t.line+';font-family:'+t.font+'"><b>Aa</b><i style="background:'+t.accent+'"></i></span><strong>'+xml(t.name)+'</strong><small>'+xml(t.detail)+'</small></button>').join('')+'</div></fieldset>'+
 '<fieldset class="studio-fieldset"><legend>QR pattern</legend><div class="studio-patterns">'+patterns.map(s=>'<button type="button" data-card-pattern="'+s.id+'" aria-pressed="'+(p.pattern===s.id)+'" class="'+(p.pattern===s.id?'selected':'')+'" '+(readOnly||!root.QRCodeStyling?'disabled':'')+'>'+s.name+'</button>').join('')+'</div></fieldset>'+
 '<p class="studio-preference-note">'+(readOnly?'This card is available to view and print. Design editing belongs to the manager or administrator.':'Your design choice is remembered for this QR in this browser.')+'</p><div class="studio-exports"><button type="button" data-card-export="print" disabled>Print card</button><button type="button" data-card-export="png" disabled>Card PNG</button><button type="button" data-card-export="svg" disabled>Vector SVG</button><button type="button" data-card-export="qr" disabled>QR only PNG</button></div><p class="studio-print-note">'+(kindOf(config.kind)==='review'?'Portrait PVC · 54 × 85.6 mm':'Table card · A6, 105 × 148 mm')+'<br>Print at actual size. Scan one sample before printing a batch.</p><p class="studio-status" role="status" aria-live="polite">Preparing your QR card…</p></div><div class="studio-preview-wrap"><div class="studio-preview" data-card-preview></div><p class="studio-preview-caption">Print preview · '+xml(config.name||config.company||'Your business')+'</p></div></div></section>';
}
async function rawQR(config,prefs){
 if(root.QRCodeStyling){const qr=new root.QRCodeStyling(qrOptions(config,prefs));const blob=await qr.getRawData('svg');if(!blob)throw Error('Unable to generate the QR.');return blob.text();}
 if(!root.QRCode)throw Error('The QR library is still loading. Refresh and try again.');
 const el=root.document.createElement('div'),options=qrOptions(config,prefs),pad=options.margin;
 new root.QRCode(el,{text:options.data,width:760,height:760,colorDark:themeFor(config,prefs).qrInk,colorLight:'#ffffff',correctLevel:root.QRCode.CorrectLevel.H});
 const canvas=el.querySelector('canvas');if(!canvas)throw Error('Unable to generate the QR.');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="760" height="760" viewBox="0 0 760 760"><rect width="760" height="760" fill="#fff"/><image x="'+pad+'" y="'+pad+'" width="'+(760-2*pad)+'" height="'+(760-2*pad)+'" href="'+canvas.toDataURL('image/png')+'"/></svg>';
}
async function pngBlob(svg,width=1800){
 const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
 try{
  const img=new root.Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Unable to prepare the image download.'));img.src=url;});
  const canvas=root.document.createElement('canvas');canvas.width=width;canvas.height=Math.round(width*img.height/img.width);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Unable to export the image.')),'image/png'));
 }finally{URL.revokeObjectURL(url);}
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=root.document.createElement('a');a.href=url;a.download=name;root.document.body.append(a);a.click();a.remove();root.setTimeout(()=>URL.revokeObjectURL(url),5000);}
function mount(host,config){
 if(!host)throw Error('QR card designer is unavailable.');
 instances.get(host)?.destroy();
 const originalURL=validateURL(config.url);config={...config,url:originalURL};host.innerHTML=editorMarkup(config);
 const preview=host.querySelector('[data-card-preview]'),status=host.querySelector('.studio-status'),exports=[...host.querySelectorAll('[data-card-export]')];
 let prefs=readPreference(config);if(!root.QRCodeStyling)prefs.pattern='square';let svg='',raw='',revision=0,promise;
 function controls(){host.querySelectorAll('[data-card-theme],[data-card-pattern]').forEach(b=>{const selected=b.dataset.cardTheme?b.dataset.cardTheme===prefs.theme:b.dataset.cardPattern===prefs.pattern;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});}
 async function render(){
  const current=++revision;exports.forEach(b=>b.disabled=true);status.textContent='Preparing your QR card…';
  try{const qr=await rawQR(config,prefs);const result=cardSVG(config,qr,prefs);if(current!==revision)return;raw=qr;svg=result;preview.innerHTML=svg;preview.dataset.ready='true';status.textContent=root.QRCodeStyling?'Ready to print or download.':'Ready to print. Basic square QR is in use.';exports.forEach(b=>b.disabled=false);}
  catch(e){if(current!==revision)return;svg=raw='';preview.innerHTML='<p class="studio-error">'+xml(e.message)+'</p>';status.textContent=e.message;throw e;}
 }
 async function exportCard(type){
  await promise;if(!svg)throw Error('Please wait for the QR card to finish loading.');
  if(type==='print'){
   const w=root.open('','_blank','width=680,height=950');if(!w)throw Error('Allow the print window to open, then try again.');
   const restaurant=kindOf(config.kind)==='restaurant',width=restaurant?'105mm':'54mm',height=restaurant?'148mm':'85.6mm';
   w.onload=()=>w.setTimeout(()=>w.print(),250);
   w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+xml(config.id||config.name||'QR card')+'</title><style>@page{size:'+width+' '+height+';margin:0}*{box-sizing:border-box}body{margin:0;background:white}body>svg{display:block;width:'+width+';height:'+height+';print-color-adjust:exact;-webkit-print-color-adjust:exact}</style></head><body>'+svg+'</body></html>');w.document.close();return;
  }
  if(type==='svg')return downloadBlob(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),filename(config,prefs,'svg'));
  if(type==='qr')return downloadBlob(await pngBlob(raw,1520),filename(config,prefs,'png').replace('.png','-qr-only.png'));
  return downloadBlob(await pngBlob(svg),filename(config,prefs,'png'));
 }
 const handleClick=async e=>{
  const b=e.target.closest('button');if(!b||!host.contains(b)||b.disabled)return;
  if(b.dataset.cardTheme||b.dataset.cardPattern){
   if(config.readOnly)return;
   prefs=preferences(config,{...prefs,...(b.dataset.cardTheme?{theme:b.dataset.cardTheme}:{pattern:b.dataset.cardPattern})});controls();
   const saved=savePreference(config,prefs);promise=render();try{await promise;if(!saved)status.textContent='Applied to this preview. Browser preferences could not be saved.';}catch{}
  }else if(b.dataset.cardExport){try{await exportCard(b.dataset.cardExport);}catch(error){status.textContent=error.message;}}
 };
 host.addEventListener('click',handleClick);
 controls();promise=render();promise.catch(()=>{});
 const controller={destroy(){++revision;host.removeEventListener('click',handleClick);if(instances.get(host)===controller)instances.delete(host);},get ready(){return promise;},get preferences(){return {...prefs};},get svg(){return svg;},get raw(){return raw;},export:exportCard};instances.set(host,controller);return controller;
}
const api={themes:catalogue,patterns,preferences,qrOptions,wrapText,cardSVG,filename,editorMarkup,mount,pngBlob};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.QRDesigns=api;
})(typeof window!=='undefined'?window:globalThis);
