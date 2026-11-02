// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

package asia.littlelegend.host;

import android.app.*;
import android.content.*;
import android.os.*;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class HostService extends Service {
 private PowerManager.WakeLock wakeLock;
 private boolean started;
 private static native int startNode(String game,String data,String port,String status,String stop);
 private String translated(int id){
  String language=getSharedPreferences("interface",MODE_PRIVATE).getString("language","zh-CN");
  android.content.res.Configuration config=new android.content.res.Configuration(getResources().getConfiguration());
  config.setLocale(java.util.Locale.forLanguageTag(language));
  return createConfigurationContext(config).getString(id);
 }
 @Override public void onCreate(){super.onCreate();NotificationManager manager=getSystemService(NotificationManager.class);manager.createNotificationChannel(new NotificationChannel("gamehost",translated(R.string.host_channel),NotificationManager.IMPORTANCE_LOW));}
 @Override public int onStartCommand(Intent intent,int flags,int id){
  if(started)return START_NOT_STICKY;started=true;
  PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE);
  Notification note=new Notification.Builder(this,"gamehost").setContentTitle(translated(R.string.host_running)).setContentText(translated(R.string.host_note)).setSmallIcon(android.R.drawable.ic_menu_share).setContentIntent(open).setOngoing(true).build();startForeground(1,note);
  wakeLock=((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"littlelegend:host");wakeLock.acquire(12*60*60*1000L);
  String port=intent==null?"":intent.getStringExtra("port");
  new Thread(()->{
   try{copyAssets("game",new File(getFilesDir(),"game"));System.loadLibrary("node");System.loadLibrary("legendhost");startNode(new File(getFilesDir(),"game").getAbsolutePath(),new File(getFilesDir(),"data").getAbsolutePath(),port==null?"":port,new File(getFilesDir(),"host-status.json").getAbsolutePath(),new File(getFilesDir(),"host-stop").getAbsolutePath());}
   catch(Throwable e){try(FileOutputStream out=new FileOutputStream(new File(getFilesDir(),"host-status.json"))){org.json.JSONObject error=new org.json.JSONObject();error.put("type","error");error.put("message",String.valueOf(e.getMessage()));out.write(error.toString().getBytes(StandardCharsets.UTF_8));}catch(Exception ignored){}}
   finally{if(wakeLock!=null&&wakeLock.isHeld())wakeLock.release();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();android.os.Process.killProcess(android.os.Process.myPid());}
  },"littlelegend-node").start();return START_NOT_STICKY;
 }
 private void copyAssets(String source,File target)throws IOException {String[] children=getAssets().list(source);if(children!=null&&children.length>0){if(!target.exists()&&!target.mkdirs())throw new IOException("无法创建游戏目录");for(String child:children)copyAssets(source+"/"+child,new File(target,child));}else{try(InputStream in=getAssets().open(source);OutputStream out=new FileOutputStream(target)){byte[] buffer=new byte[16384];int n;while((n=in.read(buffer))>0)out.write(buffer,0,n);}}}
 @Override public IBinder onBind(Intent intent){return null;}
 @Override public void onDestroy(){if(wakeLock!=null&&wakeLock.isHeld())wakeLock.release();super.onDestroy();}
}
