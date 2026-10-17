(()=>{'use strict';
const $=id=>document.getElementById(id), state={pages:[],chosen:-1,batch:[],queue:[],links:[],logs:[]};
const deps={pdf:['./vendor/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'],lib:['./vendor/pdf-lib.min.js','https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js','https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'],zip:['./vendor/jszip.min.js','https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js','https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js']};
const workers=['./vendor/pdf.worker.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js','https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'];
const base=n=>n.replace(/\.[^.]+$/,'').replace(/[\\/:*?"<>|]/g,'_');
const delay=()=>new Promise(r=>setTimeout(r,0));
function log(s){state.logs.push(`${new Date().toLocaleString('ja-JP')} ${s}`);if(state.logs.length>120)state.logs.shift();}
function err(e){console.error(e);const s=e?.message||String(e);$('suite-error').textContent=s;$('suite-error').classList.remove('hidden');log('エラー: '+s)}
function status(s){$('suite-progress').textContent=s;log(s)}
function resetOutput(){state.links.forEach(x=>URL.revokeObjectURL(x));state.links=[];$('suite-output').replaceChildren();$('suite-output').classList.add('hidden');$('suite-error').classList.add('hidden')}
function link(blob,name,label){let a=document.createElement('a');const u=URL.createObjectURL(blob);state.links.push(u);a.href=u;a.download=name;a.textContent=label||`↓ ${name}`;$('suite-output').append(a);$('suite-output').classList.remove('hidden');if(navigator.share&&navigator.canShare){let b=document.createElement('button');b.textContent=`共有: ${name}`;b.onclick=async()=>{try{const f=new File([blob],name,{type:blob.type||'application/octet-stream'});if(navigator.canShare({files:[f]}))await navigator.share({files:[f],title:name});else alert('この端末では共有できません。ダウンロードしてください。')}catch(e){if(e.name!=='AbortError')err(e)}};$('suite-output').append(b)}}
function clearButtons(){$('suite-error').classList.add('hidden')}
async function fetchScript(url){return new Promise((res,rej)=>{const el=document.createElement('script');el.src=url;el.onload=res;el.onerror=()=>{el.remove();rej(Error('ライブラリが読み込めません: '+url))};document.head.appendChild(el)})}
async function dependency(key){const exists=()=>key==='pdf'?window.pdfjsLib:key==='lib'?window.PDFLib:window.JSZip;if(exists())return;let failure;for(let i=0;i<deps[key].length;i++)try{await fetchScript(deps[key][i]);if(exists()){if(key==='pdf')window.pdfjsLib.GlobalWorkerOptions.workerSrc=workers[i];return}}catch(e){failure=e}throw failure||Error('ライブラリを読み込めません。インターネット接続を確認してください。')}
function getPdf(data,font='standard'){return window.pdfjsLib.getDocument({data:new Uint8Array(data.slice(0)),isEvalSupported:false,cMapUrl:(window.FILECRAFT_OFFLINE?'./vendor/cmaps/':'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/'),cMapPacked:true,standardFontDataUrl:(window.FILECRAFT_OFFLINE?'./vendor/standard_fonts/':'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/'),useSystemFonts:false,disableFontFace:font!=='standard',fontExtraProperties:true,verbosity:1}).promise}
function blobCanvas(canvas,type,quality){return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(Error('画像変換に失敗しました')),type,quality))}
function imageBlobUrl(blob){return new Promise((res,rej)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{URL.revokeObjectURL(url);res(img)};img.onerror=()=>{URL.revokeObjectURL(url);rej(Error('画像を読み込めません'))};img.src=url})}
async function renderPage(page,dpi,format='image/png',quality=.92){const vp=page.getViewport({scale:dpi/72});if(vp.width*vp.height>28000000)throw Error('ページが大きすぎます。DPIを下げてください');const cv=document.createElement('canvas');cv.width=Math.round(vp.width);cv.height=Math.round(vp.height);const ctx=cv.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvasの初期化に失敗');ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);try{await page.render({canvasContext:ctx,viewport:vp,background:'#ffffff'}).promise;const b=await blobCanvas(cv,format,quality);if(b.type!==format)throw Error('指定形式はブラウザで使用できません');return b}finally{cv.width=cv.height=0;page.cleanup()}}
async function guarded(fn){clearButtons();try{await fn()}catch(e){err(e)}}
function activate(t){for(const b of document.querySelectorAll('[data-tool]'))b.classList.toggle('chosen',b.dataset.tool===t);for(const name of ['edit','batch','queue'])$(name+'-tool').classList.toggle('hidden',name!==t);resetOutput();}
for(const b of document.querySelectorAll('[data-tool]'))b.onclick=()=>activate(b.dataset.tool);
async function pdfPages(files){await Promise.all([dependency('pdf'),dependency('lib')]);state.pages=[];state.chosen=-1;$('edit-pages').replaceChildren();for(const f of files){if(!/\.pdf$/i.test(f.name)&&f.type!=='application/pdf')continue;status(`${f.name}を読み込み中`);const ab=await f.arrayBuffer();const doc=await getPdf(ab);try{for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);const thumb=await renderPage(pg,45);const src=URL.createObjectURL(thumb);state.pages.push({data:ab,name:f.name,page:i,rotate:0,preview:src});await delay()}}finally{await doc.destroy()}}displayPages();status(`${state.pages.length}ページを読み込みました`)}
function displayPages(){const host=$('edit-pages');host.replaceChildren();state.pages.forEach((p,i)=>{const el=document.createElement('button');el.className='page-tile'+(i===state.chosen?' selected':'');const img=document.createElement('img');img.src=p.preview;img.style.transform=`rotate(${p.rotate}deg)`;img.alt=`${p.name} の ${p.page} ページ`;const span=document.createElement('span');span.textContent=`${i+1}. ${p.name} / ${p.page}ページ ${p.rotate?'('+p.rotate+'°)':''}`;el.append(img,span);el.onclick=()=>{state.chosen=i;displayPages()};host.append(el)});$('edit-status').textContent=`${state.pages.length}ページ：ページをタップして選択・並び替え・削除`}
$('edit-files').onchange=e=>guarded(async()=>{state.pages.forEach(p=>URL.revokeObjectURL(p.preview));resetOutput();await pdfPages([...e.target.files])});
$('edit-all').onclick=()=>{state.chosen=-1;displayPages()};$('edit-none').onclick=()=>{state.chosen=-1;displayPages();status('個別ページをタップして選択してください')};
function move(n){const i=state.chosen,j=i+n;if(i<0||j<0||j>=state.pages.length)return;[state.pages[i],state.pages[j]]=[state.pages[j],state.pages[i]];state.chosen=j;displayPages()}
$('edit-up').onclick=()=>move(-1);$('edit-down').onclick=()=>move(1);$('edit-rotate').onclick=()=>{let p=state.pages[state.chosen];if(p){p.rotate=(p.rotate+90)%360;displayPages()}};
$('edit-remove').onclick=()=>{const i=state.chosen;if(i<0)return;URL.revokeObjectURL(state.pages[i].preview);state.pages.splice(i,1);state.chosen=-1;displayPages()};
async function editedPdf(pages){await dependency('lib');const out=await PDFLib.PDFDocument.create();let prior=null,src=null;for(let i=0;i<pages.length;i++){const p=pages[i];if(p.data!==prior){src=await PDFLib.PDFDocument.load(p.data,{ignoreEncryption:false});prior=p.data}const [copied]=await out.copyPages(src,[p.page-1]);if(p.rotate)copied.setRotation(PDFLib.degrees(((copied.getRotation().angle||0)+p.rotate)%360));out.addPage(copied);status(`PDF編集 ${i+1}/${pages.length}`);await delay()}return new Blob([await out.save()],{type:'application/pdf'})}
$('edit-export').onclick=()=>guarded(async()=>{resetOutput();if(!state.pages.length)throw Error('PDFを追加してください');link(await editedPdf(state.pages),'FileCraft_edited.pdf');status('PDFを保存できます')});
$('edit-split').onclick=()=>guarded(async()=>{resetOutput();if(!state.pages.length)throw Error('PDFを追加してください');await dependency('zip');const zip=new JSZip();for(let i=0;i<state.pages.length;i++){const p=state.pages[i],b=await editedPdf([p]);zip.file(`page_${String(i+1).padStart(3,'0')}.pdf`,b)}link(await zip.generateAsync({type:'blob'}),'FileCraft_split.zip');status('分割PDFをZIPにまとめました')});
$('batch-files').onchange=async e=>{state.batch=[...e.target.files].filter(f=>f.type.startsWith('image/'));const h=$('batch-thumbs');h.replaceChildren();for(let i=0;i<Math.min(state.batch.length,16);i++){const url=URL.createObjectURL(state.batch[i]);const img=document.createElement('img');img.src=url;img.alt=state.batch[i].name;img.onload=()=>URL.revokeObjectURL(url);h.append(img)}status(`${state.batch.length}画像を選択しました`)};
$('batch-quality').oninput=()=>{$('batch-quality-out').value=$('batch-quality').value+'%'};
$('batch-run').onclick=()=>guarded(async()=>{resetOutput();if(!state.batch.length)throw Error('画像を選択してください');await dependency('zip');const zip=new JSZip(),type=$('batch-format').value,q=Number($('batch-quality').value)/100,max=Number($('batch-size').value),ext=type==='image/jpeg'?'jpg':type.split('/')[1];let failed=[];for(let i=0;i<state.batch.length;i++){const f=state.batch[i];try{const img=await imageBlobUrl(f);let w=img.naturalWidth,h=img.naturalHeight;const factor=max?Math.min(1,max/Math.max(w,h)):1;w=Math.max(1,Math.round(w*factor));h=Math.max(1,Math.round(h*factor));if(w*h>28000000)throw Error('画素数が大きすぎます');const cv=document.createElement('canvas');cv.width=w;cv.height=h;const ctx=cv.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas未対応');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);const b=await blobCanvas(cv,type,q);cv.width=cv.height=0;if(b.type!==type)throw Error('形式未対応');zip.file(`${String(i+1).padStart(3,'0')}_${base(f.name)}.${ext}`,b);status(`画像処理 ${i+1}/${state.batch.length} ・${f.name}`)}catch(e){failed.push(`${f.name}: ${e.message}`)}await delay()}if(Object.keys(zip.files).length===0)throw Error('画像変換に成功したファイルがありません\n'+failed.join('\n'));const blob=await zip.generateAsync({type:'blob'});link(blob,'FileCraft_images.zip');$('suite-output').append(document.createTextNode(` ${state.batch.length-failed.length}件成功 / ${failed.length}件失敗`));if(failed.length)err(Error(failed.join(' / ')));status('画像一括処理を完了しました')});
$('queue-files').onchange=e=>{state.queue=[...e.target.files].filter(f=>/\.pdf$/i.test(f.name)||f.type==='application/pdf');$('queue-files-summary').textContent=`${state.queue.length}件のPDFを登録`;const list=$('queue-list');list.replaceChildren();state.queue.forEach(f=>{const d=document.createElement('div');d.textContent=`待機中: ${f.name}`;list.append(d)})};
$('queue-run').onclick=()=>guarded(async()=>{
  resetOutput();
  if(!state.queue.length)throw Error('PDFを選択してください');
  await Promise.all([dependency('pdf'),dependency('zip')]);
  const zip=new JSZip(), dpi=Number($('queue-dpi').value),ext=$('queue-format').value,
        fmt=`image/${ext}`,font=$('queue-font').value,fail=[];
  let succeeded=0,totalPages=0;
  const list=$('queue-list');list.replaceChildren();
  for(let fi=0;fi<state.queue.length;fi++){
    const file=state.queue[fi],d=document.createElement('div');list.append(d);
    let doc;const pending=[];
    try{
      d.textContent=`処理中: ${file.name}`;
      doc=await getPdf(await file.arrayBuffer(),font);
      for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
        const page=await doc.getPage(pageNo);
        if(pageNo===1){try{
          const t=await page.getTextContent(),n=t.items.reduce((a,b)=>a+(b.str?.length||0),0);
          log(`${file.name}の先頭ページ抽出文字数: ${n}。描画保証を意味しません`);
        }catch(e){log(`${file.name}: 文字抽出に失敗`)}}
        const blob=await renderPage(page,dpi,fmt,.92);
        pending.push({name:`page_${String(pageNo).padStart(3,'0')}.${ext==='jpeg'?'jpg':ext}`,blob});
        status(`${fi+1}/${state.queue.length}ファイル ・ ${pageNo}/${doc.numPages}ページ`);
        await delay();
      }
      // Commit only after all pages of this file rendered successfully.
      const folder=`${String(fi+1).padStart(3,'0')}_${base(file.name)}`;
      for(const item of pending)zip.file(`${folder}/${item.name}`,item.blob);
      succeeded++;totalPages+=pending.length;
      d.textContent=`成功: ${file.name} (${pending.length}ページ)`;
    }catch(e){
      fail.push(`${file.name}: ${e.message}`);
      d.textContent=`失敗: ${file.name} / ${e.message}`;
      log(d.textContent);
    }finally{if(doc)await doc.destroy()}
  }
  if(!succeeded)throw Error('成功したPDFがありません。'+fail.join('、'));
  link(await zip.generateAsync({type:'blob',compression:'STORE'}),'FileCraft_pdf_queue.zip');
  if(fail.length)err(Error(fail.join(' / ')));
  status(`キュー完了: ${succeeded}件成功・${totalPages}ページ / ${fail.length}件失敗`);
});
const fields=['dpi','font-mode','pages','quality','paper','margin','img-quality','batch-format','batch-size','batch-quality','queue-format','queue-dpi','queue-font'];
function readSettings(){let values={};for(const id of fields)values[id]=$(id).value;values.pdfFormat=document.querySelector('[data-format].chosen')?.dataset.format||'png';return values}
function applySettings(v){for(const id of fields)if(v[id]!=null)$(id).value=v[id];const b=document.querySelector(`[data-format="${['png','jpeg','webp'].includes(v.pdfFormat)?v.pdfFormat:'png'}"]`);if(b)b.click();for(const [id,out] of [['quality','quality-label'],['img-quality','img-quality-label'],['batch-quality','batch-quality-out']])$(out).value=$(id).value+'%'}
$('preset-save').onclick=()=>guarded(async()=>{localStorage.setItem('filecraft-v1.1-settings',JSON.stringify(readSettings()));$('saved-info').textContent='設定を保存しました';status('設定をこのブラウザに保存しました')});
$('preset-load').onclick=()=>guarded(async()=>{const v=localStorage.getItem('filecraft-v1.1-settings');if(!v)throw Error('保存済み設定がありません');applySettings(JSON.parse(v));$('saved-info').textContent='設定を読み込みました'});
$('diagnostic-copy').onclick=()=>guarded(async()=>{const t=`FileCraft v1.1.1\n日時: ${new Date().toISOString()}\nブラウザ: ${navigator.userAgent}\n`+state.logs.join('\n');await navigator.clipboard.writeText(t);status('診断情報をコピーしました（ファイルの内容は含みません）')});
try{const saved=localStorage.getItem('filecraft-v1.1-settings');if(saved)applySettings(JSON.parse(saved))}catch(e){log('保存設定を読み込めませんでした')}
})();
