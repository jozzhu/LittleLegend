// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

package asia.littlelegend.host;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.res.ColorStateList;
import android.graphics.*;
import android.graphics.drawable.*;
import android.net.Uri;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.*;

public class MainActivity extends Activity {
 private final Handler handler=new Handler(Looper.getMainLooper());
 private final ExecutorService network=Executors.newSingleThreadExecutor();
 private final int background=Color.rgb(21,28,31),ink=Color.rgb(237,236,228),muted=Color.rgb(151,169,174),gold=Color.rgb(219,192,129),line=Color.rgb(54,69,74);
 private EditText port;
 private TextView status,address,portValue,uptime,tunnel,online,rooms,playing,addressNote;
 private Button start,stop,open,copy,admin,watch,keyButton;
 private String localUrl,lanUrl,adminUrl;
 private File statusFile,stopFile;
 private boolean starting,monitorBusy,active,destroyed;
 private long startTime,runningSince,lastMonitor;
 private Bitmap artwork;
 private final java.util.Map<String,String[]> languages=new java.util.HashMap<>();
 private final java.util.Map<TextView,String[]> languageSources=new java.util.IdentityHashMap<>();
 private String language="zh-CN";
 private View rootView;
 private final Runnable refresh=new Runnable(){public void run(){readStatus();translateViews(rootView);handler.postDelayed(this,1000);}};
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  loadLanguages();
  getWindow().setStatusBarColor(background);getWindow().setNavigationBarColor(background);
  statusFile=new File(getFilesDir(),"host-status.json");stopFile=new File(getFilesDir(),"host-stop");
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.HORIZONTAL);root.setBackgroundColor(background);root.setFitsSystemWindows(true);
  try(InputStream in=getAssets().open("game/public/assets/battlefield_2560x1440.png")){artwork=BitmapFactory.decodeStream(in);}catch(IOException ignored){}
  LinearLayout brand=new LinearLayout(this);brand.setOrientation(LinearLayout.VERTICAL);brand.setPadding(dp(20),dp(20),dp(16),dp(16));brand.setBackground(new SceneDrawable());
  root.addView(brand,new LinearLayout.LayoutParams(dp(getResources().getConfiguration().screenWidthDp<760?180:210),-1));
  TextView name=text("小传说",30,gold,true);name.setTypeface(android.graphics.Typeface.SERIF,android.graphics.Typeface.BOLD);brand.addView(name);
  brand.addView(text("THE LITTLE LEGEND",10,Color.rgb(211,221,215),false));
  brand.addView(new View(this),new LinearLayout.LayoutParams(1,0,1));
  TextView invitation=text("朋友入席\n传说开场",24,ink,true);invitation.setTypeface(android.graphics.Typeface.SERIF,android.graphics.Typeface.NORMAL);brand.addView(invitation);
  TextView edition=text("HOST CONSOLE",10,gold,false);edition.setPadding(0,dp(20),0,dp(4));brand.addView(edition);
  brand.addView(text("局域网服务端",11,muted,false));
  ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);root.addView(scroll,new LinearLayout.LayoutParams(0,-1,1));
  LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(24),dp(22),dp(24),dp(20));scroll.addView(content);
  LinearLayout heading=row();heading.setGravity(Gravity.CENTER_VERTICAL);content.addView(heading);
  heading.addView(text("房主控制台",23,ink,true),new LinearLayout.LayoutParams(0,-2,1));
  Spinner locale=new Spinner(this);locale.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,new String[]{"中文","English","日本語"}){
   @Override public View getView(int position,View reused,ViewGroup parent){TextView label=(TextView)super.getView(position,reused,parent);label.setTextColor(ink);label.setTextSize(12);return label;}
   @Override public View getDropDownView(int position,View reused,ViewGroup parent){TextView label=(TextView)super.getDropDownView(position,reused,parent);label.setTextColor(ink);label.setBackgroundColor(background);return label;}
  });locale.setSelection(language.equals("en")?1:language.equals("ja")?2:0);heading.addView(locale,new LinearLayout.LayoutParams(dp(105),dp(40)));
  locale.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onNothingSelected(android.widget.AdapterView<?> p){}public void onItemSelected(android.widget.AdapterView<?> p,View v,int pos,long id){language=new String[]{"zh-CN","en","ja"}[pos];getSharedPreferences("interface",MODE_PRIVATE).edit().putString("language",language).apply();translateViews(rootView);}});
  TextView subtitle=text("创建牌桌，邀请同一网络的朋友加入。",12,muted,false);subtitle.setPadding(0,dp(4),0,dp(16));content.addView(subtitle);divider(content);
  status=text("●  未启动",12,muted,false);status.setPadding(0,dp(14),0,dp(14));content.addView(status);
  LinearLayout controls=row();controls.setGravity(Gravity.CENTER_VERTICAL);content.addView(controls);
  LinearLayout portBox=new LinearLayout(this);portBox.setOrientation(LinearLayout.VERTICAL);controls.addView(portBox,new LinearLayout.LayoutParams(0,-2,1));
  portBox.addView(text("服务端口 · 留空自动分配",11,muted,false));
  port=new EditText(this);port.setSingleLine(true);port.setTextColor(ink);port.setTextSize(16);port.setHintTextColor(muted);port.setHint("自动");port.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);port.setFilters(new android.text.InputFilter[]{new android.text.InputFilter.LengthFilter(5)});port.setBackground(surface(Color.rgb(30,40,44),line));port.setPadding(dp(10),0,dp(10),0);portBox.addView(port,new LinearLayout.LayoutParams(-1,dp(40)));
  start=button(controls,"启动服务",android.R.drawable.ic_media_play,true,v->startHost());
  stop=button(controls,"停止",android.R.drawable.ic_delete,false,v->stopHost());
  TextView addressHeading=text("联机地址",14,ink,true);addressHeading.setPadding(0,dp(20),0,dp(10));content.addView(addressHeading);
  LinearLayout addressPanel=new LinearLayout(this);addressPanel.setOrientation(LinearLayout.VERTICAL);addressPanel.setPadding(dp(14),dp(12),dp(14),dp(12));addressPanel.setBackground(surface(Color.rgb(29,40,44),Color.TRANSPARENT));content.addView(addressPanel);
  address=text("等待开启牌桌",21,Color.rgb(213,231,225),false);address.setTextIsSelectable(true);addressPanel.addView(address);
  addressNote=text("启动后，将此地址发送给其他玩家。",11,muted,false);addressNote.setPadding(0,dp(6),0,0);addressPanel.addView(addressNote);
  LinearLayout serviceMetrics=row();content.addView(serviceMetrics);
  portValue=metric(serviceMetrics,"实际端口");uptime=metric(serviceMetrics,"运行时间");tunnel=metric(serviceMetrics,"穿透本地目标");
  divider(content);
  LinearLayout liveMetrics=row();content.addView(liveMetrics);
  online=metric(liveMetrics,"在线玩家");rooms=metric(liveMetrics,"现存房间");playing=metric(liveMetrics,"进行中对局");
  LinearLayout actions=row();actions.setPadding(0,dp(12),0,0);content.addView(actions);
  open=button(actions,"进入牌桌",android.R.drawable.ic_menu_view,true,v->browse(localUrl));
  copy=button(actions,"复制地址",android.R.drawable.ic_menu_share,false,v->{((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("联机地址",lanUrl));Toast.makeText(this,"联机地址已复制",Toast.LENGTH_SHORT).show();});
  watch=button(actions,"观战",android.R.drawable.ic_menu_search,false,v->openWatch());
  LinearLayout management=row();management.setPadding(0,dp(8),0,0);content.addView(management);
  admin=button(management,"管理后台",android.R.drawable.ic_menu_manage,false,v->browse(adminUrl));
  keyButton=button(management,"管理密钥",android.R.drawable.ic_lock_lock,false,v->showKey());
  TextView note=text("其他玩家通过浏览器加入。停止服务会断开连接，账号与存档保留。",11,muted,false);note.setPadding(0,dp(18),0,0);content.addView(note);
  rootView=root;setContentView(root);setRunning(false);translateViews(root);
  if(Build.VERSION.SDK_INT>=30)root.post(()->{
   android.view.WindowInsetsController controller=root.getWindowInsetsController();
   if(controller!=null)controller.setSystemBarsAppearance(0,android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
  });
  if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},1);
 }
 private void loadLanguages(){
  language=getSharedPreferences("interface",MODE_PRIVATE).getString("language","zh-CN");
  if(!language.equals("en")&&!language.equals("ja"))language="zh-CN";
  try(InputStream in=getAssets().open("game/public/host-languages.json");ByteArrayOutputStream out=new ByteArrayOutputStream()){
   byte[] bytes=new byte[4096];int n;while((n=in.read(bytes))>0)out.write(bytes,0,n);
   JSONArray entries=new JSONArray(new String(out.toByteArray(),StandardCharsets.UTF_8));
   for(int i=0;i<entries.length();i++){JSONArray e=entries.getJSONArray(i);languages.put(e.getString(0),new String[]{e.getString(1),e.getString(2)});}
  }catch(Exception ignored){}
 }
 private String tr(String value){
  if(language.equals("zh-CN")||value==null)return value;
  int index=language.equals("en")?0:1;String[] exact=languages.get(value);if(exact!=null)return exact[index];
  String longest=null;for(String key:languages.keySet())if(value.startsWith(key)&&(longest==null||key.length()>longest.length()))longest=key;
  return longest==null?value:languages.get(longest)[index]+value.substring(longest.length());
 }
 private void translateViews(View view){
  if(view==null||view instanceof Spinner)return;
  if(view instanceof TextView&&!(view instanceof EditText)){
   TextView label=(TextView)view;String current=label.getText().toString(),raw=current;
   String[] saved=languageSources.get(label);if(saved!=null&&saved[1].equals(current))raw=saved[0];
   String translated=tr(raw);languageSources.put(label,new String[]{raw,translated});if(!translated.equals(current))label.setText(translated);
  }
  if(view instanceof EditText){EditText input=(EditText)view;if(input.getHint()!=null)input.setHint(tr("自动"));}
  if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)translateViews(group.getChildAt(i));}
 }
 private int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
 private TextView text(String value,float size,int color,boolean bold){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(null,android.graphics.Typeface.BOLD);return t;}
 private LinearLayout row(){LinearLayout row=new LinearLayout(this);row.setOrientation(LinearLayout.HORIZONTAL);return row;}
 private GradientDrawable surface(int color,int border){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(4));d.setStroke(dp(1),border);return d;}
 private void divider(LinearLayout parent){View v=new View(this);v.setBackgroundColor(line);parent.addView(v,new LinearLayout.LayoutParams(-1,dp(1)));}
 private TextView metric(LinearLayout parent,String label){
  LinearLayout block=new LinearLayout(this);block.setOrientation(LinearLayout.VERTICAL);block.setPadding(0,dp(14),dp(8),dp(14));parent.addView(block,new LinearLayout.LayoutParams(0,-2,1));
  block.addView(text(label,11,muted,false));TextView value=text("—",18,ink,false);value.setPadding(0,dp(5),0,0);block.addView(value);return value;
 }
 private Button button(LinearLayout parent,String label,int icon,boolean primary,View.OnClickListener click){
  Button b=new Button(this);b.setText(label);b.setTextSize(12);b.setAllCaps(false);b.setGravity(Gravity.CENTER);b.setMinWidth(0);b.setMinimumWidth(0);b.setMinHeight(dp(42));b.setPadding(dp(8),dp(6),dp(8),dp(6));b.setStateListAnimator(null);
  int color=primary?Color.rgb(25,31,31):ink;
  b.setTextColor(new ColorStateList(new int[][]{new int[]{-android.R.attr.state_enabled},new int[]{}},new int[]{Color.rgb(104,117,120),color}));
  StateListDrawable states=new StateListDrawable();states.addState(new int[]{-android.R.attr.state_enabled},surface(Color.rgb(30,37,40),line));states.addState(new int[]{android.R.attr.state_pressed},surface(primary?Color.rgb(235,210,153):Color.rgb(47,59,62),line));states.addState(new int[]{},surface(primary?gold:Color.rgb(37,46,49),primary?gold:line));b.setBackground(states);
  Drawable glyph=getDrawable(icon).mutate();glyph.setTintList(b.getTextColors());glyph.setBounds(0,0,dp(16),dp(16));b.setCompoundDrawables(glyph,null,null,null);b.setCompoundDrawablePadding(dp(5));
  LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);lp.setMargins(dp(6),0,0,0);parent.addView(b,lp);b.setOnClickListener(click);return b;
 }
 private class SceneDrawable extends Drawable{
  final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG|Paint.FILTER_BITMAP_FLAG);
  public void draw(Canvas canvas){
   Rect b=getBounds();canvas.drawColor(background);paint.setAlpha(255);
   if(artwork!=null){float scale=Math.max((float)b.width()/artwork.getWidth(),(float)b.height()/artwork.getHeight());float w=artwork.getWidth()*scale,h=artwork.getHeight()*scale;canvas.drawBitmap(artwork,null,new RectF((b.width()-w)/2,(b.height()-h)/2,(b.width()+w)/2,(b.height()+h)/2),paint);}
   paint.setColor(Color.argb(95,13,20,22));canvas.drawRect(b,paint);
   paint.setShader(new LinearGradient(0,0,0,b.height(),Color.argb(0,17,24,25),Color.argb(240,17,24,25),Shader.TileMode.CLAMP));canvas.drawRect(b,paint);paint.setShader(null);
  }
  public void setAlpha(int alpha){}public void setColorFilter(ColorFilter filter){}public int getOpacity(){return PixelFormat.OPAQUE;}
 }
 private void setRunning(boolean alive){
  start.setEnabled(!alive);port.setEnabled(!alive);stop.setEnabled(alive);open.setEnabled(alive);copy.setEnabled(alive);admin.setEnabled(alive);watch.setEnabled(alive);keyButton.setEnabled(alive);
  if(!alive){online.setText("—");rooms.setText("—");playing.setText("—");portValue.setText("—");uptime.setText("—");tunnel.setText("—");address.setText("等待开启牌桌");}
 }
 private void browse(String url){if(url!=null)startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url).buildUpon().appendQueryParameter("lang",language).build()));}
 private void showKey(){
  try{String key=new String(java.nio.file.Files.readAllBytes(new File(getFilesDir(),"data/admin.key").toPath()),StandardCharsets.UTF_8);new AlertDialog.Builder(this).setTitle(tr("服务器管理密钥")).setMessage(tr("仅在本机后台使用。")).setPositiveButton(tr("复制密钥"),(dialog,which)->((ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("管理密钥",key))).setNegativeButton(tr("取消"),null).show();}
  catch(IOException e){Toast.makeText(this,tr("请先启动服务"),Toast.LENGTH_SHORT).show();}
 }
 private void startHost(){
  String value=port.getText().toString().trim();
  try{if(!value.isEmpty()&&(Integer.parseInt(value)<1||Integer.parseInt(value)>65535))throw new NumberFormatException();}
  catch(NumberFormatException e){status.setText("端口须为 1–65535，或留空");return;}
  if(!clear(statusFile)||!clear(stopFile)){status.setText("无法清理启动状态");return;}
  starting=true;startTime=System.currentTimeMillis();runningSince=0;setRunning(false);start.setEnabled(false);port.setEnabled(false);status.setTextColor(gold);status.setText("●  正在启动…");
  Intent intent=new Intent(this,HostService.class);intent.putExtra("port",value);
  try{startForegroundService(intent);}catch(Exception e){starting=false;setRunning(false);status.setText("启动失败："+e.getMessage());}
 }
 private boolean clear(File file){return !file.exists()||file.delete();}
 private void stopHost(){new AlertDialog.Builder(this).setMessage(tr("停止服务？所有玩家会断线，存档保留。")).setPositiveButton(tr("停止"),(d,w)->{try{new FileOutputStream(stopFile).close();status.setText(tr("正在停止…"));stop.setEnabled(false);}catch(IOException e){status.setText(e.getMessage());}}).setNegativeButton(tr("取消"),null).show();}
 private void readStatus(){
  if(!statusFile.exists()){if(starting&&System.currentTimeMillis()-startTime>30000)status.setText("启动超过 30 秒，请检查服务状态。");return;}
  try{
   JSONObject data=new JSONObject(new String(java.nio.file.Files.readAllBytes(statusFile.toPath()),StandardCharsets.UTF_8));
   if(data.optString("type").equals("error")){starting=false;setRunning(false);status.setTextColor(Color.rgb(232,147,136));status.setText(data.optString("message"));return;}
   boolean alive=isAlive();starting=false;setRunning(alive);
   if(!alive){status.setTextColor(muted);status.setText("●  服务已停止，存档已保留");return;}
   localUrl=data.getString("localUrl");adminUrl=data.getString("adminUrl");
   JSONArray urls=data.getJSONArray("lanUrls");lanUrl=urls.length()>0?urls.getString(0):localUrl;address.setText(lanUrl);
   addressNote.setText(urls.length()>0?"其他玩家在浏览器打开此地址，无需安装软件。":"未检测到局域网地址，请连接 Wi-Fi。");
   status.setTextColor(Color.rgb(132,204,173));status.setText("●  服务运行中");
   portValue.setText(String.valueOf(data.getInt("port")));tunnel.setText(data.getString("tunnelTarget"));
   if(runningSince==0)runningSince=statusFile.lastModified();long seconds=Math.max(0,(System.currentTimeMillis()-runningSince)/1000);
   uptime.setText(String.format(java.util.Locale.ROOT,"%02d:%02d:%02d",seconds/3600,(seconds/60)%60,seconds%60));
   if(System.currentTimeMillis()-lastMonitor>=3000)refreshMonitor();
  }catch(Exception ignored){}
 }
 private JSONObject hostApi(String base,String route,boolean post)throws Exception{
  HttpURLConnection connection=(HttpURLConnection)new URL(base+route).openConnection(Proxy.NO_PROXY);
  connection.setConnectTimeout(2500);connection.setReadTimeout(2500);connection.setUseCaches(false);
  String key=new String(java.nio.file.Files.readAllBytes(new File(getFilesDir(),"data/admin.key").toPath()),StandardCharsets.UTF_8).trim();connection.setRequestProperty("X-Admin-Key",key);
  try{
   if(post){connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setRequestProperty("Content-Type","application/json");try(OutputStream out=connection.getOutputStream()){out.write("{}".getBytes(StandardCharsets.UTF_8));}}
   if(connection.getResponseCode()!=200)throw new IOException("服务返回 "+connection.getResponseCode());
   try(InputStream in=connection.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))>0)out.write(buffer,0,n);return new JSONObject(new String(out.toByteArray(),StandardCharsets.UTF_8));}
  }finally{connection.disconnect();}
 }
 private void refreshMonitor(){
  if(monitorBusy)return;monitorBusy=true;lastMonitor=System.currentTimeMillis();final String base=localUrl;
  network.execute(()->{
   try{JSONObject data=hostApi(base,"/api/admin/live",false);handler.post(()->{if(!destroyed&&active&&base.equals(localUrl)&&isAlive()){online.setText(String.valueOf(data.optInt("online")));rooms.setText(String.valueOf(data.optInt("rooms")));playing.setText(String.valueOf(data.optInt("playing")));}});}
   catch(Exception e){handler.post(()->{if(!destroyed&&active){online.setText("—");rooms.setText("—");playing.setText("—");}});}
   finally{handler.post(()->monitorBusy=false);}
  });
 }
 private void openWatch(){
  final String base=localUrl;watch.setEnabled(false);
  network.execute(()->{
   try{JSONObject data=hostApi(base,"/api/admin/gm-ticket",true);final String url=base+"/gz.html#ticket="+data.getString("ticket");handler.post(()->{if(!destroyed&&active&&base.equals(localUrl)&&isAlive())browse(url);});}
   catch(Exception e){handler.post(()->{if(!destroyed)Toast.makeText(this,tr("无法打开观战，请重试"),Toast.LENGTH_SHORT).show();});}
   finally{handler.post(()->{if(!destroyed)watch.setEnabled(isAlive());});}
  });
 }
 private boolean isAlive(){File lock=new File(getFilesDir(),"data/host.lock");try{JSONObject value=new JSONObject(new String(java.nio.file.Files.readAllBytes(lock.toPath()),StandardCharsets.UTF_8));return new File("/proc/"+value.getInt("pid")).exists();}catch(Exception e){return starting;}}
 @Override protected void onResume(){super.onResume();active=true;handler.post(refresh);}
 @Override protected void onPause(){active=false;handler.removeCallbacks(refresh);super.onPause();}
 @Override protected void onDestroy(){destroyed=true;handler.removeCallbacks(refresh);network.shutdownNow();super.onDestroy();}
}
