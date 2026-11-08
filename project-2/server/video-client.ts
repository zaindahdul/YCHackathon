/**
 * Browser code served by the app, kept as strings so the deployed function has no bundling step.
 * Both strings are written with no backticks, `${`, or backslashes, so they survive being
 * interpolated into a template-literal page and contain no closing script tag.
 *
 *   TRACK_JS         the public /t.js snippet founders put on their own product
 *   DEMO_STUDIO_JS   the demo tab's in-browser renderer; the founder's file never leaves the browser
 */

export const TRACK_JS = `(function(){
  var me=document.currentScript;
  if(!me)return;
  var slug=me.getAttribute('data-launch');
  if(!slug)return;
  var endpoint;
  try{endpoint=new URL('/e',me.src).href}catch(e){return}
  var params;
  try{params=new URLSearchParams(location.search)}catch(e){params=null}
  function read(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function write(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  var mem={};
  function keep(name){
    var v=params&&params.get(name);
    if(v){write(name,v);mem[name]=v;return v}
    return read(name)||mem[name]||'';
  }
  var ref=keep('lp_ref');
  var ch=keep('lp_ch');
  var qa=me.getAttribute('data-qa')==='1'||(params&&params.get('lp_qa')==='1')||read('lp_qa')==='1';
  if(params&&params.get('lp_qa')==='1')write('lp_qa','1');
  function send(event){
    var body=JSON.stringify({launch:slug,ref:ref,ch:ch,event:event,qa:!!qa});
    try{
      return fetch(endpoint,{method:'POST',mode:'cors',keepalive:true,headers:{'content-type':'text/plain'},body:body}).then(function(){return true},function(){return false});
    }catch(e){return Promise.resolve(false)}
  }
  send('visit');
  window.launchpad={activate:function(){return send('activate')}};
})();`;

export const DEMO_STUDIO_JS = `(function(){
  function mount(){
    var root=document.getElementById('demo-studio');
    if(!root||root.getAttribute('data-ready'))return;
    root.setAttribute('data-ready','1');

    var plan={};
    try{plan=JSON.parse(root.getAttribute('data-plan')||'{}')||{}}catch(e){plan={}}
    var company=root.getAttribute('data-company')||'';
    var scenes=(plan.scenes||[]).map(function(s){
      return {seconds:Math.max(1.5,Math.min(20,Number(s.seconds)||4)),heading:String(s.heading||''),caption:String(s.caption||'')};
    });
    var total=scenes.reduce(function(a,s){return a+s.seconds},0);

    var BAD='This file could not be decoded by your browser. Try an MP4 (H.264) or WebM recording.';
    var NO_FOOTAGE='Storyboard cut — captions over title cards, no product footage. Upload a screen recording for a real demo cut.';
    var FONT='Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';

    var style=document.createElement('style');
    style.textContent=''
      +'.ds{display:grid;gap:16px}'
      +'.ds-row{display:flex;flex-wrap:wrap;gap:10px;align-items:center}'
      +'.ds-field{display:grid;gap:6px;font-size:14px}'
      +'.ds-field>b{font-weight:550}'
      +'.ds-file{font:inherit;font-size:14px;max-width:100%}'
      +'.ds-seg{display:inline-flex;border:1px solid var(--rule,#e5e3dc);border-radius:8px;overflow:hidden}'
      +'.ds-seg label{position:relative;cursor:pointer}'
      +'.ds-seg input{position:absolute;inset:0;opacity:0;cursor:pointer;margin:0}'
      +'.ds-seg span{display:block;padding:8px 13px;font-size:13.5px;color:var(--muted,#6f6c64)}'
      +'.ds-seg input:checked+span{background:var(--ink,#141413);color:var(--panel,#fff);font-weight:550}'
      +'.ds-seg input:focus-visible+span{outline:2px solid var(--focus,#2563eb);outline-offset:-2px}'
      +'.ds-btn{font:inherit;font-size:14px;font-weight:550;padding:10px 16px;border-radius:8px;border:1px solid var(--btn,#141413);background:var(--btn,#141413);color:var(--btn-ink,#fff);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}'
      +'.ds-btn.q{background:transparent;color:var(--ink,#141413);border-color:var(--rule,#e5e3dc)}'
      +'.ds-btn[disabled]{opacity:.5;cursor:not-allowed}'
      +'.ds-btn:focus-visible{outline:2px solid var(--focus,#2563eb);outline-offset:2px}'
      +'.ds-mode{font-size:13.5px;color:var(--muted,#6f6c64);margin:0;max-width:62ch}'
      +'.ds-bar{height:6px;background:var(--soft,#f1efe9);border-radius:3px;overflow:hidden}'
      +'.ds-bar i{display:block;height:100%;width:0;background:var(--ink,#141413);transition:width .15s linear}'
      +'.ds-status{font-size:13.5px;color:var(--muted,#6f6c64);margin:0;font-variant-numeric:tabular-nums}'
      +'.ds-err{border-left:2px solid #c2410c;padding:8px 12px;font-size:14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center}'
      +'.ds-out{display:grid;gap:10px}'
      +'.ds-out video{width:100%;max-height:70vh;background:#0e1013;border-radius:10px;display:block}'
      +'[hidden]{display:none!important}';
    document.head.appendChild(style);

    function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}

    var wrapEl=el('div','ds');
    var fileField=el('label','ds-field');
    fileField.appendChild(el('b',null,'Screen recording (optional)'));
    var fileInput=el('input','ds-file');
    fileInput.type='file';
    fileInput.accept='video/*';
    fileField.appendChild(fileInput);
    fileField.appendChild(el('span','ds-mode','Only upload footage you are allowed to use. The file stays in this browser and is never sent to Launchpad.'));
    wrapEl.appendChild(fileField);

    var controls=el('div','ds-row');
    var seg=el('div','ds-seg');
    seg.setAttribute('role','radiogroup');
    seg.setAttribute('aria-label','Video format');
    var initial=plan.format==='consumer'?'portrait':'landscape';
    [['landscape','16:9 · Technical B2B, X'],['portrait','9:16 · Short-form']].forEach(function(o){
      var l=el('label');
      var i=el('input');
      i.type='radio';i.name='ds-format';i.value=o[0];i.checked=o[0]===initial;
      l.appendChild(i);l.appendChild(el('span',null,o[1]));seg.appendChild(l);
    });
    controls.appendChild(seg);
    var renderBtn=el('button','ds-btn','Render demo cut');
    renderBtn.type='button';
    controls.appendChild(renderBtn);
    var removeBtn=el('button','ds-btn q','Remove file');
    removeBtn.type='button';removeBtn.hidden=true;
    controls.appendChild(removeBtn);
    wrapEl.appendChild(controls);

    var mode=el('p','ds-mode');
    wrapEl.appendChild(mode);

    var bar=el('div','ds-bar');
    var fill=el('i');
    bar.appendChild(fill);bar.hidden=true;
    bar.setAttribute('role','progressbar');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax','100');bar.setAttribute('aria-label','Render progress');
    wrapEl.appendChild(bar);
    var status=el('p','ds-status');
    status.setAttribute('aria-live','polite');status.hidden=true;
    wrapEl.appendChild(status);

    var err=el('div','ds-err');
    err.setAttribute('role','alert');err.hidden=true;
    var errText=el('span');
    var retry=el('button','ds-btn q','Try again');
    retry.type='button';
    err.appendChild(errText);err.appendChild(retry);
    wrapEl.appendChild(err);

    var out=el('div','ds-out');out.hidden=true;
    var outVideo=el('video');
    outVideo.controls=true;outVideo.playsInline=true;
    var outLabel=el('p','ds-mode');
    var outRow=el('div','ds-row');
    var download=el('a','ds-btn','Download');
    outRow.appendChild(download);
    out.appendChild(outVideo);out.appendChild(outLabel);out.appendChild(outRow);
    wrapEl.appendChild(out);
    root.appendChild(wrapEl);

    var file=null,rendering=false,outUrl=null;

    function pickMime(){
      var c=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
      for(var i=0;i<c.length;i++){if(MediaRecorder.isTypeSupported(c[i]))return c[i]}
      return '';
    }
    function supported(){
      var cv=document.createElement('canvas');
      return typeof MediaRecorder!=='undefined'&&typeof cv.captureStream==='function'&&!!pickMime();
    }
    function refreshMode(){
      mode.textContent=file?('Real demo cut: '+scenes.length+' sections sampled across '+file.name+', with captions. Silent. About '+Math.round(total)+' seconds.'):NO_FOOTAGE;
      removeBtn.hidden=!file;
    }
    function fail(msg){errText.textContent=msg;err.hidden=false;bar.hidden=true;status.hidden=true}
    function clearFail(){err.hidden=true;errText.textContent=''}
    function clamp(x){return Math.max(0,Math.min(1,x))}
    function ease(x){x=clamp(x);return 1-Math.pow(1-x,3)}
    function wrap(g,text,max,limit){
      var words=text.split(' ').filter(Boolean),lines=[],cur='';
      for(var i=0;i<words.length;i++){
        var next=cur?cur+' '+words[i]:words[i];
        if(g.measureText(next).width>max&&cur){lines.push(cur);cur=words[i]}else{cur=next}
      }
      if(cur)lines.push(cur);
      if(lines.length>limit){lines=lines.slice(0,limit);lines[limit-1]=lines[limit-1].replace(/[ .,;:]*$/,'')+'…'}
      return lines;
    }
    function blockHeight(lines,lh){return lines.length*lh}
    function drawLines(g,lines,x,y,lh){for(var i=0;i<lines.length;i++)g.fillText(lines[i],x,y+i*lh)}

    function brand(g,W,u,alpha,tag){
      g.globalAlpha=alpha;
      g.fillStyle='#ffffff';
      g.save();g.translate(44*u,50*u);g.rotate(Math.PI/4);g.fillRect(-7*u,-7*u,14*u,14*u);g.restore();
      g.textBaseline='middle';g.textAlign='left';
      g.font='600 '+(24*u)+'px '+FONT;
      g.fillText(company,66*u,50*u);
      if(tag){
        g.textAlign='right';g.font='500 '+(20*u)+'px '+FONT;g.fillStyle='rgba(255,255,255,.6)';
        g.fillText(tag,W-40*u,50*u);g.textAlign='left';
      }
      g.textBaseline='alphabetic';g.globalAlpha=1;
    }
    function timeline(g,W,H,u,i,n,t,dur){
      g.fillStyle='rgba(255,255,255,.16)';g.fillRect(0,H-5*u,W,5*u);
      g.fillStyle='#ffffff';g.fillRect(0,H-5*u,W*((i+clamp(t/dur))/n),5*u);
    }
    function drawCard(g,W,H,s,i,n,t){
      var dur=s.seconds,land=W>H,u=land?W/1280:W/720;
      var fade=Math.min(ease(t/0.35),ease((dur-t)/0.3));
      g.fillStyle='#0e1013';g.fillRect(0,0,W,H);
      var cx=W*(0.2+0.6*((i+clamp(t/dur))/n)),cy=H*0.42;
      var r=g.createRadialGradient(cx,cy,0,cx,cy,Math.max(W,H)*0.75);
      r.addColorStop(0,'rgba(120,150,255,.20)');r.addColorStop(1,'rgba(120,150,255,0)');
      g.fillStyle=r;g.fillRect(0,0,W,H);
      brand(g,W,u,1,'Storyboard');
      var pad=(land?88:56)*u,max=W-pad*2;
      var hSize=(land?64:58)*u,hLh=hSize*1.14,cSize=(land?30:32)*u,cLh=cSize*1.4,gap=26*u;
      g.font='650 '+hSize+'px '+FONT;
      var hl=wrap(g,s.heading,max,land?3:5);
      g.font='400 '+cSize+'px '+FONT;
      var cl=wrap(g,s.caption,max,land?4:7);
      var h=blockHeight(hl,hLh)+gap+blockHeight(cl,cLh);
      var top=(H-h)/2+hSize*0.8;
      var rise=(1-ease(t/0.45))*18*u;
      g.textAlign='left';g.globalAlpha=fade;
      g.fillStyle='#ffffff';g.font='650 '+hSize+'px '+FONT;
      drawLines(g,hl,pad,top+rise,hLh);
      g.globalAlpha=Math.min(fade,ease((t-0.2)/0.45));
      g.fillStyle='rgba(255,255,255,.76)';g.font='400 '+cSize+'px '+FONT;
      drawLines(g,cl,pad,top+blockHeight(hl,hLh)+gap-hSize*0.3+rise,cLh);
      g.globalAlpha=1;
      g.fillStyle='rgba(255,255,255,.55)';g.font='500 '+(20*u)+'px '+FONT;
      g.fillText((i+1)+' / '+n,pad,H-44*u);
      timeline(g,W,H,u,i,n,t,dur);
    }
    function drawFootage(g,W,H,v,s,i,n,t){
      if(v.error)throw new Error(BAD);
      var dur=s.seconds,land=W>H,u=land?W/1280:W/720;
      var fade=Math.min(ease(t/0.3),ease((dur-t)/0.25));
      g.fillStyle='#0e1013';g.fillRect(0,0,W,H);
      var areaY=land?0:H*0.24,areaH=land?H:H*0.52;
      var sc=Math.min(W/v.videoWidth,areaH/v.videoHeight);
      var dw=v.videoWidth*sc,dh=v.videoHeight*sc;
      g.drawImage(v,(W-dw)/2,areaY+(areaH-dh)/2,dw,dh);
      g.textAlign='left';
      if(land){
        var sc2=g.createLinearGradient(0,H*0.5,0,H);
        sc2.addColorStop(0,'rgba(8,9,11,0)');sc2.addColorStop(1,'rgba(8,9,11,.9)');
        g.fillStyle=sc2;g.fillRect(0,H*0.5,W,H*0.5);
        var top2=g.createLinearGradient(0,0,0,110*u);
        top2.addColorStop(0,'rgba(8,9,11,.65)');top2.addColorStop(1,'rgba(8,9,11,0)');
        g.fillStyle=top2;g.fillRect(0,0,W,110*u);
        brand(g,W,u,1,'');
        var pad=56*u,max=W*0.8,hS=40*u,hL=hS*1.16,cS=26*u,cL=cS*1.36;
        g.font='650 '+hS+'px '+FONT;var hl=wrap(g,s.heading,max,2);
        g.font='400 '+cS+'px '+FONT;var cl=wrap(g,s.caption,max,2);
        var y=H-44*u-blockHeight(cl,cL)-10*u-blockHeight(hl,hL)+hS*0.8;
        g.globalAlpha=fade;g.fillStyle='#ffffff';g.font='650 '+hS+'px '+FONT;
        drawLines(g,hl,pad,y,hL);
        g.fillStyle='rgba(255,255,255,.84)';g.font='400 '+cS+'px '+FONT;
        drawLines(g,cl,pad,y+blockHeight(hl,hL)+10*u-hS*0.14,cL);
        g.globalAlpha=1;
      }else{
        brand(g,W,u,1,'');
        var p2=48*u,m2=W-p2*2,hS2=50*u,hL2=hS2*1.14,cS2=34*u,cL2=cS2*1.36;
        g.font='650 '+hS2+'px '+FONT;var hl2=wrap(g,s.heading,m2,3);
        g.globalAlpha=fade;g.fillStyle='#ffffff';
        drawLines(g,hl2,p2,areaY-34*u-blockHeight(hl2,hL2)+hS2*0.8,hL2);
        g.fillStyle='rgba(255,255,255,.84)';g.font='400 '+cS2+'px '+FONT;
        var cl2=wrap(g,s.caption,m2,6);
        drawLines(g,cl2,p2,areaY+areaH+60*u,cL2);
        g.globalAlpha=1;
      }
      timeline(g,W,H,u,i,n,t,dur);
    }
    function seek(v,time,ms){
      return new Promise(function(ok,no){
        if(Math.abs(v.currentTime-time)<0.02&&v.readyState>=2){ok();return}
        var timer=setTimeout(function(){clean();no(new Error(BAD))},ms||8000);
        function done(){clean();ok()}
        function bad(){clean();no(new Error(BAD))}
        function clean(){clearTimeout(timer);v.removeEventListener('seeked',done);v.removeEventListener('error',bad)}
        v.addEventListener('seeked',done);v.addEventListener('error',bad);
        v.currentTime=time;
      });
    }
    async function loadVideo(f,url){
      var v=document.createElement('video');
      v.muted=true;v.playsInline=true;v.preload='auto';
      v.style.cssText='position:absolute;width:1px;height:1px;opacity:0;pointer-events:none';
      root.appendChild(v);
      await new Promise(function(ok,no){
        var timer=setTimeout(function(){no(new Error(BAD))},15000);
        v.onloadeddata=function(){clearTimeout(timer);ok()};
        v.onerror=function(){clearTimeout(timer);no(new Error(BAD))};
        v.src=url;
      });
      if(!isFinite(v.duration)){try{await seek(v,1e7,4000)}catch(e){}}
      if(!v.videoWidth||!isFinite(v.duration)||v.duration<=0){v.remove();throw new Error(BAD)}
      return v;
    }
    function runScene(seconds,frame,tick){
      return new Promise(function(ok,no){
        var start=performance.now();
        var id=setInterval(function(){
          try{
            var t=(performance.now()-start)/1000;
            if(t>=seconds){clearInterval(id);frame(seconds-0.001);ok();return}
            frame(t);tick(t);
          }catch(e){clearInterval(id);no(e)}
        },33);
      });
    }
    function selected(){
      var i=seg.querySelector('input:checked');
      return i?i.value:'landscape';
    }

    async function start(){
      if(rendering)return;
      clearFail();
      if(!supported()){fail('This browser cannot record video from a canvas. Open this page in a current Chrome, Edge or Firefox to render.');return}
      if(!scenes.length){fail('This demo plan has no scenes yet. Add your product facts and regenerate the kit.');return}
      rendering=true;renderBtn.disabled=true;fileInput.disabled=true;removeBtn.disabled=true;
      renderBtn.textContent='Rendering…';
      bar.hidden=false;status.hidden=false;fill.style.width='0%';
      status.textContent='Preparing…';
      var sourceUrl=null,video=null,stream=null;
      var fmt=selected(),W=fmt==='portrait'?720:1280,H=fmt==='portrait'?1280:720;
      try{
        if(file){
          if(file.type&&file.type.indexOf('video/')!==0)throw new Error('That file is not a video. Choose a screen recording.');
          sourceUrl=URL.createObjectURL(file);
          video=await loadVideo(file,sourceUrl);
        }
        var cv=document.createElement('canvas');cv.width=W;cv.height=H;
        var g=cv.getContext('2d');
        if(!g)throw new Error('Could not start the canvas renderer in this browser.');
        if(document.fonts&&document.fonts.ready){try{await document.fonts.ready}catch(e){}}
        g.fillStyle='#0e1013';g.fillRect(0,0,W,H);
        stream=cv.captureStream(30);
        var mime=pickMime();
        var rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});
        var chunks=[],recErr=null;
        rec.ondataavailable=function(e){if(e.data&&e.data.size)chunks.push(e.data)};
        rec.onerror=function(e){recErr=e.error||new Error('Recording failed.')};
        var stopped=new Promise(function(ok){rec.onstop=ok});
        rec.start(250);
        var done=0,n=scenes.length;
        for(var i=0;i<n;i++){
          if(recErr)throw recErr;
          var s=scenes[i];
          if(video){
            if(rec.state==='recording')rec.pause();
            video.pause();
            var startAt=n>1?Math.max(0,video.duration-s.seconds)*(i/(n-1)):0;
            await seek(video,startAt);
            drawFootage(g,W,H,video,s,i,n,0);
            try{await video.play()}catch(e){throw new Error(BAD)}
            if(rec.state==='paused')rec.resume();
          }
          await (function(idx,sc,base){
            return runScene(sc.seconds,function(t){
              if(video)drawFootage(g,W,H,video,sc,idx,n,t);else drawCard(g,W,H,sc,idx,n,t);
            },function(t){
              var pct=Math.round(((base+t)/total)*100);
              fill.style.width=pct+'%';
              bar.setAttribute('aria-valuenow',String(pct));
              status.textContent='Rendering scene '+(idx+1)+' of '+n+' · '+Math.round(base+t)+'s of '+Math.round(total)+'s. Keep this tab in front.';
            });
          })(i,s,done);
          done+=s.seconds;
        }
        if(recErr)throw recErr;
        rec.stop();
        await stopped;
        if(!chunks.length)throw new Error('The recorder produced no video. Keep this tab in front and try again.');
        var type=mime.split(';')[0];
        var blob=new Blob(chunks,{type:type});
        if(outUrl)URL.revokeObjectURL(outUrl);
        outUrl=URL.createObjectURL(blob);
        outVideo.onerror=function(){fail('The cut was recorded, but this browser could not play it back. Use Download to check the file.')};
        outVideo.onloadedmetadata=function(){
          if(outVideo.duration===Infinity){
            outVideo.ontimeupdate=function(){outVideo.ontimeupdate=null;outVideo.currentTime=0};
            outVideo.currentTime=1e9;
          }
        };
        outVideo.src=outUrl;
        var base=(company||'demo').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'demo';
        download.href=outUrl;
        download.download=base+'-demo-'+(fmt==='portrait'?'9x16':'16x9')+(type==='video/mp4'?'.mp4':'.webm');
        download.textContent='Download '+(type==='video/mp4'?'MP4':'WebM');
        outLabel.textContent=video?('Demo cut from your footage: '+n+' sections with captions. Silent.'):NO_FOOTAGE;
        out.hidden=false;
        fill.style.width='100%';
        status.textContent='Done. '+Math.round(total)+' seconds, '+(blob.size/1048576).toFixed(1)+' MB.';
      }catch(e){
        fail((e&&e.message)||'Rendering failed.');
      }finally{
        if(stream)stream.getTracks().forEach(function(t){t.stop()});
        if(video){video.pause();video.remove()}
        if(sourceUrl)URL.revokeObjectURL(sourceUrl);
        rendering=false;renderBtn.disabled=false;fileInput.disabled=false;removeBtn.disabled=false;
        renderBtn.textContent='Render demo cut';
      }
    }

    fileInput.addEventListener('change',function(){file=fileInput.files&&fileInput.files[0]||null;clearFail();refreshMode()});
    removeBtn.addEventListener('click',function(){fileInput.value='';file=null;clearFail();refreshMode()});
    renderBtn.addEventListener('click',start);
    retry.addEventListener('click',start);
    refreshMode();
    if(!scenes.length)renderBtn.disabled=true;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();`;
