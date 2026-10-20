import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createLandmarker, detectPose, angleAt, angleFromVertical, calculateMetrics } from './pose.js'
import { Activity, Camera, ChartNoAxesCombined, Download, Dumbbell, History, Settings, Ruler, Play, Square, Trash2, Plus, ChevronRight, ShieldCheck, Database, Menu, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import './style.css'

const DB_NAME = 'movelab-db'
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error)
  })
}
async function allSessions() {
  const db = await openDB()
  return new Promise((resolve, reject) => { const r=db.transaction('sessions').objectStore('sessions').getAll(); r.onsuccess=()=>resolve(r.result.sort((a,b)=>b.createdAt-a.createdAt)); r.onerror=()=>reject(r.error) })
}
async function saveSession(item) {
  const db=await openDB()
  return new Promise((resolve,reject)=>{ const r=db.transaction('sessions','readwrite').objectStore('sessions').put(item); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error) })
}
async function deleteSession(id) {
  const db=await openDB()
  return new Promise((resolve,reject)=>{ const r=db.transaction('sessions','readwrite').objectStore('sessions').delete(id); r.onsuccess=()=>resolve(); r.onerror=()=>reject(r.error) })
}
const fmt = (v, digits=1) => Number.isFinite(v) ? v.toFixed(digits) : '—'
const dateLabel = t => new Date(t).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
function exportCSV(rows) {
  const headers=['日期','名稱','深蹲次數','平均深蹲深度(膝角度°)','最低膝角度(°)','肩關節活動角度(°)','軀幹傾斜角度(°)','校正比例(px/cm)','備註']
  const body=rows.map(s=>[new Date(s.createdAt).toLocaleString('zh-TW'),s.name||'未命名',s.reps||0,s.avgKneeAngle??'',s.minKneeAngle??'',s.shoulderROM??'',s.avgTrunkAngle??'',s.pxPerCm??'',s.notes||''])
  const csv=[headers,...body].map(row=>row.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n')
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`MoveLab_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url)
}
function App(){
  const [page,setPage]=useState('home'), [sessions,setSessions]=useState([]), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false)
  const [name,setName]=useState(''), [notes,setNotes]=useState(''), [cameraOn,setCameraOn]=useState(false), [recording,setRecording]=useState(false)
  const [status,setStatus]=useState('尚未啟動相機'), [metrics,setMetrics]=useState({reps:0,kneeAngle:null,shoulderAngle:null,trunkAngle:null,shoulderROM:0,minKneeAngle:null})
  const [calibration,setCalibration]=useState({points:[],distance:100,pxPerCm:null}), [facing,setFacing]=useState('environment')
  const videoRef=useRef(null), canvasRef=useRef(null), streamRef=useRef(null), landmarkerRef=useRef(null), rafRef=useRef(null), lastVideoTime=useRef(-1), topKnee=useRef(null), repState=useRef('up'), repCount=useRef(0), shoulderSamples=useRef([]), trunkSamples=useRef([]), kneeSamples=useRef([])
  const [menuOpen,setMenuOpen]=useState(false)
  async function refresh(){try{setSessions(await allSessions())}catch(e){console.error(e)}}
  useEffect(()=>{refresh(); return ()=>stopCamera()},[])
  useEffect(()=>{if(notice){const t=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(t)}},[notice])
  async function startCamera(){
    try{
      setStatus('正在啟動相機…')
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:facing,width:{ideal:1280},height:{ideal:720}},audio:false})
      streamRef.current=stream; videoRef.current.srcObject=stream; await videoRef.current.play()
      landmarkerRef.current=await createLandmarker()
      setCameraOn(true); setStatus('相機已啟動・請站到畫面中央')
      rafRef.current=requestAnimationFrame(loop)
   }catch(e){
      setStatus('啟動失敗：'+(e?.name||'Error'))
      setNotice((e?.name||'Error')+': '+(e?.message||'未知錯誤'))
      console.error('MoveLab 啟動錯誤：',e)
    }
  function stopCamera(){
    if(rafRef.current) cancelAnimationFrame(rafRef.current)
    if(streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop())
    streamRef.current=null; setCameraOn(false); setRecording(false)
  }
  function loop(){
    const video=videoRef.current, canvas=canvasRef.current
    if(!video||!canvas||!landmarkerRef.current||video.readyState<2){rafRef.current=requestAnimationFrame(loop);return}
    const w=video.videoWidth||640,h=video.videoHeight||480
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
    const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h)
    if(video.currentTime!==lastVideoTime.current){
      lastVideoTime.current=video.currentTime
      try{
        const result=detectPose(landmarkerRef.current,video,performance.now())
        const landmarks=result?.landmarks?.[0]
        if(landmarks){
          const pairs=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]]
          ctx.lineWidth=4;ctx.strokeStyle='#65e4bd';ctx.fillStyle='#ffffff'
          pairs.forEach(([a,b])=>{if(landmarks[a]&&landmarks[b]){ctx.beginPath();ctx.moveTo(landmarks[a].x*w,landmarks[a].y*h);ctx.lineTo(landmarks[b].x*w,landmarks[b].y*h);ctx.stroke()}})
          landmarks.forEach(p=>{ctx.beginPath();ctx.arc(p.x*w,p.y*h,4,0,Math.PI*2);ctx.fill()})
          const m=calculateMetrics(landmarks,w,h)
          if(m){
            setMetrics(prev=>({...prev,kneeAngle:m.kneeAngle,shoulderAngle:m.shoulderAngle,trunkAngle:m.trunkAngle}))
            if(recording){
              if(m.kneeAngle!=null){
                kneeSamples.current.push(m.kneeAngle)
                if(repState.current==='up'&&m.kneeAngle<105)repState.current='down'
                if(repState.current==='down'&&m.kneeAngle>155){repState.current='up';repCount.current+=1;setMetrics(p=>({...p,reps:repCount.current}))}
              }
              if(m.shoulderAngle!=null)shoulderSamples.current.push(m.shoulderAngle)
              if(m.trunkAngle!=null)trunkSamples.current.push(m.trunkAngle)
              if(kneeSamples.current.length) setMetrics(p=>({...p,minKneeAngle:Math.min(...kneeSamples.current)}))
            }
          }
        }
      }catch(e){console.warn('Pose detection frame failed',e)}
    }
    // Calibration line is drawn on top of the video
    if(calibration.points.length===2){
      const [a,b]=calibration.points
      ctx.strokeStyle='#ffbf69';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(a.x*w,a.y*h);ctx.lineTo(b.x*w,b.y*h);ctx.stroke()
      ;[a,b].forEach((p,i)=>{ctx.fillStyle='#ffbf69';ctx.beginPath();ctx.arc(p.x*w,p.y*h,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#101b2b';ctx.font='bold 14px sans-serif';ctx.fillText(i?'B':'A',p.x*w+12,p.y*h-10)})
    }else calibration.points.forEach((p,i)=>{ctx.fillStyle='#ffbf69';ctx.beginPath();ctx.arc(p.x*w,p.y*h,9,0,Math.PI*2);ctx.fill();ctx.fillStyle='#101b2b';ctx.font='bold 14px sans-serif';ctx.fillText(i?'B':'A',p.x*w+12,p.y*h-10)})
    rafRef.current=requestAnimationFrame(loop)
  }
  function cameraClick(e){
    if(!cameraOn)return
    const rect=e.currentTarget.getBoundingClientRect()
    const x=(e.clientX-rect.left)/rect.width,y=(e.clientY-rect.top)/rect.height
    setCalibration(c=>{const pts=c.points.length>=2?[]:[...c.points,{x,y}];let pxPerCm=null;if(pts.length===2){const dx=(pts[0].x-pts[1].x)*(videoRef.current?.videoWidth||1),dy=(pts[0].y-pts[1].y)*(videoRef.current?.videoHeight||1);pxPerCm=Math.hypot(dx,dy)/(Number(c.distance)||100)}return {...c,points:pts,pxPerCm}})
  }
  function startRecording(){
    repCount.current=0;repState.current='up';kneeSamples.current=[];shoulderSamples.current=[];trunkSamples.current=[]
    setMetrics({reps:0,kneeAngle:null,shoulderAngle:null,trunkAngle:null,shoulderROM:0,minKneeAngle:null})
    setRecording(true);setStatus('分析中・請以側面完整入鏡')
  }
  async function saveCurrent(){
    if(!recording && !kneeSamples.current.length){setNotice('請先開始分析並完成動作，再儲存資料。');return}
    setBusy(true)
    const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null
    const item={id:crypto.randomUUID(),createdAt:Date.now(),name:name.trim()||'動作分析',notes,reps:repCount.current,
      avgKneeAngle:avg(kneeSamples.current),minKneeAngle:kneeSamples.current.length?Math.min(...kneeSamples.current):null,
      shoulderROM:shoulderSamples.current.length?Math.max(...shoulderSamples.current)-Math.min(...shoulderSamples.current):null,
      avgTrunkAngle:avg(trunkSamples.current),pxPerCm:calibration.pxPerCm}
    try{await saveSession(item);await refresh();setRecording(false);setNotice('分析紀錄已儲存到此裝置');setPage('history')}
    catch(e){setNotice('儲存失敗，請確認瀏覽器儲存空間設定。')}
    setBusy(false)
  }
  async function remove(id){await deleteSession(id);await refresh();setNotice('已刪除紀錄')}
  const nav=[{id:'home',label:'總覽',icon:Activity},{id:'capture',label:'動作分析',icon:Camera},{id:'history',label:'紀錄資料',icon:History},{id:'settings',label:'設定',icon:Settings}]
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen?'open':''}`}>
      <div className="brand"><div className="brand-icon"><Activity size={23}/></div><div><b>MoveLab</b><span>動作分析工作室</span></div><button className="close-menu" onClick={()=>setMenuOpen(false)}><X size={18}/></button></div>
      <div className="workspace"><span className="workspace-dot"></span> 個人工作區</div>
      <div className="nav-label">工作台</div>
      {nav.map(n=><button key={n.id} className={`nav-item ${page===n.id?'active':''}`} onClick={()=>{setPage(n.id);setMenuOpen(false)}}><n.icon size={19}/><span>{n.label}</span>{n.id==='history'&&sessions.length>0&&<small>{sessions.length}</small>}</button>)}
      <div className="sidebar-bottom"><div className="privacy"><ShieldCheck size={18}/><div><b>資料保存在本機</b><span>不會自動上傳雲端</span></div></div><div className="version">MOVELAB · BETA 1.0</div></div>
    </aside>
    {menuOpen&&<div className="scrim" onClick={()=>setMenuOpen(false)}></div>}
    <main className="main">
      <header className="topbar"><button className="mobile-menu" onClick={()=>setMenuOpen(true)}><Menu/></button><div className="breadcrumb">工作台 <ChevronRight size={14}/> <b>{nav.find(n=>n.id===page)?.label}</b></div><div className="top-right"><span className="live-dot"></span><span>本機模式</span><div className="avatar">ML</div></div></header>
      {page==='home'&&<section className="page">
        <div className="welcome-row"><div><div className="eyebrow">MOVEMENT INTELLIGENCE</div><h1>讓每一次動作，<em>都有依據。</em></h1><p className="subhead">用手機相機觀察動作品質，將訓練過程轉化為可追蹤的數據。</p></div><div className="hero-art"><div className="hero-circle"><Dumbbell size={44}/></div><span className="float-chip chip-one">POSE TRACKING</span><span className="float-chip chip-two">01 / MOVE</span></div></div>
        <div className="quick-stats"><div className="stat-card"><div className="stat-icon mint"><Activity size={19}/></div><span>累積分析次數</span><strong>{sessions.length}</strong><small>已儲存的分析紀錄</small></div><div className="stat-card"><div className="stat-icon lavender"><ChartNoAxesCombined size={19}/></div><span>最近一次深蹲</span><strong>{sessions[0]?.reps??'—'}<i>{sessions.length?'次':''}</i></strong><small>{sessions[0]?dateLabel(sessions[0].createdAt):'完成分析後顯示'}</small></div><div className="stat-card"><div className="stat-icon peach"><Ruler size={19}/></div><span>相機校正</span><strong>{calibration.pxPerCm?'已完成':'待校正'}</strong><small>{calibration.pxPerCm?`${fmt(calibration.pxPerCm,2)} px/cm`:'設定參考距離以建立比例'}</small></div></div>
        <div className="section-heading"><div><h2>開始你的分析</h2><p>選擇一項任務，準備好就開始。</p></div></div>
        <div className="action-grid"><button className="action-card primary-action" onClick={()=>setPage('capture')}><div className="action-top"><div className="action-icon"><Camera/></div><span className="action-number">01</span></div><h3>開始動作分析</h3><p>開啟相機、校正比例，追蹤深蹲與關節角度。</p><div className="action-link">進入分析 <ChevronRight size={16}/></div></button><button className="action-card" onClick={()=>setPage('history')}><div className="action-top"><div className="action-icon secondary"><History/></div><span className="action-number">02</span></div><h3>查看歷史紀錄</h3><p>回顧過往訓練數據，或將紀錄匯出成 CSV。</p><div className="action-link">查看紀錄 <ChevronRight size={16}/></div></button></div>
        <div className="info-banner"><div className="info-symbol"><ShieldCheck/></div><div><b>分析小提醒</b><p>建議將手機固定在側面、全身入鏡、光線充足的地方。這是運動觀察輔助工具，不是醫療診斷或臨床量測設備。</p></div></div>
      </section>}
      {page==='capture'&&<section className="page">
        <div className="page-title-row"><div><div className="eyebrow">CAMERA STUDIO / 01</div><h1>動作分析</h1><p className="subhead">架好手機，點選校正點，讓數據更有參考價值。</p></div><span className={`status-pill ${cameraOn?'is-live':''}`}><span></span>{cameraOn?'相機運作中':'相機未啟動'}</span></div>
        <div className="capture-layout"><div className="camera-column">
          <div className="camera-panel"><div className="camera-toolbar"><span><span className="record-dot"></span> LIVE CAMERA</span><span className="camera-status">{status}</span></div><div className="camera-view">
            <video ref={videoRef} className={cameraOn?'visible-video':''} playsInline muted/>
            <canvas ref={canvasRef} onClick={cameraClick} className={cameraOn?'visible-canvas':''}/>
            {!cameraOn&&<div className="camera-placeholder"><div className="placeholder-icon"><Camera size={32}/></div><b>準備好開始了嗎？</b><span>啟動相機後，將手機固定並讓全身入鏡</span><button className="button-main" onClick={startCamera}><Play size={16} fill="currentColor"/> 啟動相機</button></div>}
            {cameraOn&&<div className="camera-hint">校正模式：點選畫面上的兩個參考點</div>}
          </div><div className="camera-controls">{!cameraOn?<button className="button-main" onClick={startCamera}><Camera size={17}/> 啟動相機</button>:<><button className={`button-main ${recording?'button-stop':''}`} onClick={()=>recording?setRecording(false):startRecording()}>{recording?<><Square size={16} fill="currentColor"/> 停止分析</>:<><Play size={16} fill="currentColor"/> 開始分析</>}</button><button className="button-outline" onClick={saveCurrent} disabled={busy}>{busy?'儲存中…':'儲存紀錄'}</button><button className="icon-button" title="關閉相機" onClick={stopCamera}><X size={17}/></button></>}</div></div>
          <div className="calibration-card"><div className="card-heading"><div className="card-heading-icon"><Ruler size={18}/></div><div><h3>相機比例校正</h3><p>用已知距離的物件，校正畫面比例尺</p></div><span className="step-tag">STEP 01</span></div><div className="calibration-body"><div className="calibration-instructions"><span className={`point-step ${calibration.points.length>=1?'done':''}`}>A</span><span className="instruction-line"></span><span className={`point-step ${calibration.points.length>=2?'done':''}`}>B</span><div className="instruction-copy"><b>點選兩個參考點</b><span>在相機畫面中，依序點選校正桿的兩端。</span></div></div><label className="field-label">兩點之間的真實距離（公分）</label><div className="input-with-unit"><input type="number" min="1" value={calibration.distance} onChange={e=>setCalibration(c=>({...c,distance:e.target.value,pxPerCm:c.points.length===2?Math.hypot((c.points[0].x-c.points[1].x)*(videoRef.current?.videoWidth||1),(c.points[0].y-c.points[1].y)*(videoRef.current?.videoHeight||1))/(Number(e.target.value)||100):null}))}/><span>cm</span></div><div className="calibration-result"><span>校正結果</span><strong>{calibration.pxPerCm?`${fmt(calibration.pxPerCm,2)} px/cm`:'尚未完成'}</strong><button onClick={()=>setCalibration(c=>({...c,points:[],pxPerCm:null}))} className="text-button">重設</button></div></div></div>
        </div><div className="metrics-column"><div className="metric-card dark-metric"><div className="metric-card-top"><span>LIVE METRICS</span><span className="live-tag">即時</span></div><h3>動作指標</h3><div className="live-metric"><span>深蹲次數</span><strong>{metrics.reps}<small> 次</small></strong></div><div className="metric-divider"></div><div className="metric-line"><span>膝關節角度</span><b>{fmt(metrics.kneeAngle)}<small>°</small></b></div><div className="metric-line"><span>肩關節角度</span><b>{fmt(metrics.shoulderAngle)}<small>°</small></b></div><div className="metric-line"><span>軀幹傾斜角度</span><b>{fmt(metrics.trunkAngle)}<small>°</small></b></div></div>
          <div className="metric-card"><div className="card-heading"><div className="card-heading-icon purple"><ChartNoAxesCombined size={18}/></div><div><h3>本次分析摘要</h3><p>停止分析後可儲存</p></div></div><div className="summary-item"><span>最低膝關節角度</span><strong>{fmt(metrics.minKneeAngle)}°</strong></div><div className="summary-item"><span>肩關節活動範圍（ROM）</span><strong>{shoulderSamples.current.length?fmt(Math.max(...shoulderSamples.current)-Math.min(...shoulderSamples.current))+'°':'—'}</strong></div><div className="summary-item"><span>平均軀幹傾斜角度</span><strong>{trunkSamples.current.length?fmt(trunkSamples.current.reduce((a,b)=>a+b,0)/trunkSamples.current.length)+'°':'—'}</strong></div></div>
          <div className="metric-card"><div className="card-heading"><div className="card-heading-icon peach"><Database size={18}/></div><div><h3>紀錄資訊</h3><p>為這次分析加上標籤</p></div></div><label className="field-label">分析名稱</label><input className="text-input" placeholder="例如：深蹲基準測試" value={name} onChange={e=>setName(e.target.value)}/><label className="field-label">備註</label><textarea className="text-input notes-input" placeholder="可記錄器材、訓練感受…" value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        </div></div>
        <div className="disclaimer"><AlertTriangle size={17}/><p><b>量測限制：</b>肩關節角度與軀幹傾斜是依 2D 骨架點估算；單一鏡頭無法可靠測出真正的脊椎節段活動度。請固定相機、採側面拍攝，並將結果視為訓練參考而非醫療判讀。</p></div>
      </section>}
      {page==='history'&&<section className="page"><div className="page-title-row"><div><div className="eyebrow">YOUR MOVEMENT DATA / 02</div><h1>分析紀錄</h1><p className="subhead">所有紀錄都保存在這台裝置的瀏覽器資料庫中。</p></div><button className="button-main" onClick={()=>exportCSV(sessions)} disabled={!sessions.length}><Download size={17}/> 匯出 CSV</button></div>
        <div className="history-summary"><div><span>總分析筆數</span><strong>{sessions.length}</strong></div><div><span>累積深蹲次數</span><strong>{sessions.reduce((n,s)=>n+(s.reps||0),0)}</strong></div><div><span>資料儲存方式</span><strong className="local-label"><Database size={16}/> IndexedDB</strong></div></div>
        <div className="history-card"><div className="history-head"><div><h3>所有紀錄</h3><p>依最近分析時間排序</p></div><button className="button-outline" onClick={()=>exportCSV(sessions)} disabled={!sessions.length}><Download size={15}/> 匯出全部</button></div>
          {!sessions.length?<div className="empty-state"><div className="empty-icon"><History size={27}/></div><b>還沒有分析紀錄</b><p>完成第一次動作分析後，資料就會出現在這裡。</p><button className="button-main" onClick={()=>setPage('capture')}>開始第一次分析 <ChevronRight size={16}/></button></div>:<div className="table-wrap"><table><thead><tr><th>分析項目</th><th>日期</th><th>深蹲次數</th><th>肩關節 ROM</th><th>軀幹傾斜</th><th></th></tr></thead><tbody>{sessions.map(s=><tr key={s.id}><td><div className="session-name"><div className="session-icon"><Dumbbell size={17}/></div><div><b>{s.name||'動作分析'}</b><span>{s.notes||'無備註'}</span></div></div></td><td>{dateLabel(s.createdAt)}</td><td><b>{s.reps||0}</b> 次</td><td>{fmt(s.shoulderROM)}°</td><td>{fmt(s.avgTrunkAngle)}°</td><td><button className="delete-button" title="刪除紀錄" onClick={()=>remove(s.id)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>}
        </div><div className="info-banner compact"><div className="info-symbol"><ShieldCheck/></div><div><b>你的資料由你掌握</b><p>目前使用裝置端 IndexedDB 儲存。清除 Safari 網站資料或更換裝置可能導致紀錄遺失，建議定期匯出 CSV 備份。</p></div></div>
      </section>}
      {page==='settings'&&<section className="page"><div className="eyebrow">PREFERENCES / 03</div><h1>設定</h1><p className="subhead">管理相機、資料與安裝方式。</p><div className="settings-grid"><div className="setting-card"><div className="setting-title"><div className="action-icon secondary"><Camera/></div><div><h3>相機設定</h3><p>選擇拍攝方向</p></div></div><label className="field-label">預設鏡頭</label><select className="text-input" value={facing} onChange={e=>setFacing(e.target.value)}><option value="environment">後鏡頭（建議）</option><option value="user">前鏡頭</option></select><p className="helper-text">切換鏡頭後，請重新啟動相機。</p></div><div className="setting-card"><div className="setting-title"><div className="action-icon"><Database/></div><div><h3>資料管理</h3><p>裝置端資料庫與匯出</p></div></div><div className="setting-row"><div><b>本機資料庫</b><span>IndexedDB · {sessions.length} 筆紀錄</span></div><CheckCircle2 className="success-icon"/></div><button className="button-outline full-button" onClick={()=>exportCSV(sessions)} disabled={!sessions.length}><Download size={16}/> 匯出全部資料 CSV</button><p className="helper-text">目前沒有連接雲端資料庫。跨裝置同步需要另外設定 Supabase 或其他後端服務。</p></div><div className="setting-card"><div className="setting-title"><div className="action-icon peach"><ShieldCheck/></div><div><h3>安裝到 iPhone</h3><p>加入主畫面，像 App 一樣開啟</p></div></div><ol className="install-steps"><li>用 iPhone 的 Safari 開啟部署後的網址。</li><li>點選底部「分享」圖示。</li><li>選擇「加入主畫面」，再點「加入」。</li></ol><div className="install-note">請使用 HTTPS 網址；Netlify 預設提供 HTTPS。</div></div><div className="setting-card"><div className="setting-title"><div className="action-icon purple"><Activity/></div><div><h3>分析方法與限制</h3><p>了解數據如何計算</p></div></div><ul className="plain-list"><li>深蹲次數：膝角度低於約 105° 視為下降，回到高於 155° 計一次。</li><li>肩關節角度：以肩、髖與手腕的 2D 座標估算抬臂角度。</li><li>軀幹傾斜：以肩髖連線相對垂直方向估算，不等同脊椎節段活動度。</li><li>校正尺：用兩點像素距離除以輸入的真實公分數，建立 px/cm 比例。</li></ul></div></div></section>}
      <footer className="footer"><span>© 2026 MoveLab Studio</span><span>Built for better movement <span className="footer-heart">✳</span></span></footer>
    </main>
    {notice&&<div className="toast"><CheckCircle2 size={18}/>{notice}</div>}
  </div>
}
createRoot(document.getElementById('root')).render(<App/>)
