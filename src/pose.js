import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
let cachedLandmarker
const MODEL_URL='https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
export async function createLandmarker(){
  if(cachedLandmarker)return cachedLandmarker
  const vision=await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm')
  const build=delegate=>PoseLandmarker.createFromOptions(vision,{
    baseOptions:{modelAssetPath:MODEL_URL,delegate},
    runningMode:'VIDEO',numPoses:1,minPoseDetectionConfidence:.5,minPosePresenceConfidence:.5,minTrackingConfidence:.5
  })
  try{
    cachedLandmarker=await build('GPU')
  }catch(e){
    console.warn('GPU delegate 失敗，改用 CPU',e)
    cachedLandmarker=await build('CPU')
  }
  return cachedLandmarker
}
export function detectPose(landmarker,video,timestamp){return landmarker.detectForVideo(video,timestamp)}
export function angleAt(a,b,c){
  if(!a||!b||!c)return null
  const ab={x:a.x-b.x,y:a.y-b.y},cb={x:c.x-b.x,y:c.y-b.y}
  const den=Math.hypot(ab.x,ab.y)*Math.hypot(cb.x,cb.y)
  if(!den)return null
  return Math.acos(Math.max(-1,Math.min(1,(ab.x*cb.x+ab.y*cb.y)/den)))*180/Math.PI
}
export function angleFromVertical(a,b){
  if(!a||!b)return null
  return Math.atan2(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*180/Math.PI
}
export function calculateMetrics(p,w,h){
  const visible=i=>p[i]&&((p[i].visibility??1)>.35)?{x:p[i].x*w,y:p[i].y*h}:null
  const side = (visible(11)&&visible(23)&&visible(25)) ? 0 : 1
  const sh=visible(side?12:11), elbow=visible(side?14:13), wrist=visible(side?16:15)
  const hip=visible(side?24:23), knee=visible(side?26:25), ankle=visible(side?28:27)
  const kneeAngle=angleAt(hip,knee,ankle)
  let shoulderAngle=null
  if(sh&&hip&&wrist) shoulderAngle=angleAt(hip,sh,wrist)
  const trunkAngle=sh&&hip?angleFromVertical(hip,sh):null
  return {kneeAngle,shoulderAngle,trunkAngle}
}
