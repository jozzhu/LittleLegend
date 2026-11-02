// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Net;
using System.Threading.Tasks;

[assembly: System.Reflection.AssemblyVersion("5.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("5.0.0.0")]
[assembly: System.Reflection.AssemblyProduct("Little Legend Host")]

class ArtPanel : Panel {
 public Image Artwork;
 public ArtPanel(){DoubleBuffered=true;}
 protected override void OnPaintBackground(PaintEventArgs e){
  e.Graphics.Clear(Color.FromArgb(24,29,31));
  if(Artwork!=null){float scale=Math.Max((float)Width/Artwork.Width,(float)Height/Artwork.Height);float w=Artwork.Width*scale,h=Artwork.Height*scale;e.Graphics.DrawImage(Artwork,(Width-w)/2,(Height-h)/2,w,h);}
  using(var shade=new SolidBrush(Color.FromArgb(95,13,20,22)))e.Graphics.FillRectangle(shade,ClientRectangle);
  using(var fade=new LinearGradientBrush(ClientRectangle,Color.FromArgb(0,17,24,25),Color.FromArgb(240,17,24,25),90))e.Graphics.FillRectangle(fade,ClientRectangle);
 }
}
class StudioButton : Button {
 public string Glyph="";
 public bool Primary;
 readonly Color ink=Color.FromArgb(238,236,228);
 public StudioButton(){FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;Cursor=Cursors.Hand;UseVisualStyleBackColor=false;SetStyle(ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.OptimizedDoubleBuffer,true);}
 protected override void OnPaint(PaintEventArgs e){
  var g=e.Graphics;g.SmoothingMode=SmoothingMode.AntiAlias;
  Color bg=Primary?Color.FromArgb(219,192,129):Color.FromArgb(37,46,49),fg=Primary?Color.FromArgb(25,31,31):ink;
  if(!Enabled){bg=Color.FromArgb(30,37,40);fg=Color.FromArgb(104,117,120);}else if(ClientRectangle.Contains(PointToClient(MousePosition)))bg=Primary?Color.FromArgb(235,210,153):Color.FromArgb(47,59,62);
  using(var brush=new SolidBrush(bg))g.FillRectangle(brush,ClientRectangle);
  using(var pen=new Pen(Primary?bg:Color.FromArgb(64,77,80)))g.DrawRectangle(pen,0,0,Width-1,Height-1);
  int icon=Glyph.Length>0?23:0;
  if(icon>0)using(var font=new Font("Segoe MDL2 Assets",11))TextRenderer.DrawText(g,Glyph,font,new Rectangle(12,0,24,Height),fg,TextFormatFlags.VerticalCenter|TextFormatFlags.HorizontalCenter);
  TextRenderer.DrawText(g,Text,Font,new Rectangle(icon>0?40:5,0,Width-(icon>0?45:10),Height),fg,TextFormatFlags.VerticalCenter|TextFormatFlags.HorizontalCenter|TextFormatFlags.EndEllipsis);
  if(Focused)using(var pen=new Pen(Color.FromArgb(173,203,202)))g.DrawRectangle(pen,3,3,Width-7,Height-7);
 }
 protected override void OnMouseEnter(EventArgs e){base.OnMouseEnter(e);Invalidate();}
 protected override void OnMouseLeave(EventArgs e){base.OnMouseLeave(e);Invalidate();}
 protected override void OnEnabledChanged(EventArgs e){base.OnEnabledChanged(e);Invalidate();}
}
class Launcher : Form {
 readonly Color background=Color.FromArgb(21,28,31),text=Color.FromArgb(237,236,228),muted=Color.FromArgb(151,169,174),gold=Color.FromArgb(219,192,129),line=Color.FromArgb(54,69,74);
 readonly TextBox port=new TextBox(),output=new TextBox(),address=new TextBox();
 readonly StudioButton start=new StudioButton(),stop=new StudioButton(),open=new StudioButton(),copy=new StudioButton(),admin=new StudioButton(),watch=new StudioButton();
 readonly Label status=new Label(),statusDot=new Label(),portValue=new Label(),uptime=new Label(),tunnelValue=new Label(),addressNote=new Label(),onlineValue=new Label(),roomsValue=new Label(),playingValue=new Label();
 readonly ComboBox adapters=new ComboBox();
 readonly Timer clock=new Timer();
 readonly Dictionary<string,string[]> languages=new Dictionary<string,string[]>();
 readonly Dictionary<Control,string[]> languageSources=new Dictionary<Control,string[]>();
 string language="zh-CN";
 readonly string languageFile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LittleLegend","language.txt");
 Process child;string localUrl,adminUrl;DateTime startedAt;bool ready,monitorBusy;int monitorTick;string[] lanUrls=new string[0];
 readonly string home=AppDomain.CurrentDomain.BaseDirectory;
 readonly string store=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"LittleLegend","data");
 [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr hwnd,int attribute,ref int value,int size);
 Launcher(){
  LoadLanguages();
  Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
  Text="小传说 · 房主控制台";AutoScaleMode=AutoScaleMode.Dpi;ClientSize=new Size(1100,760);MinimumSize=new Size(1040,760);Font=new Font("Microsoft YaHei UI",10);BackColor=background;ForeColor=text;StartPosition=FormStartPosition.CenterScreen;DoubleBuffered=true;
  try{int dark=1;DwmSetWindowAttribute(Handle,20,ref dark,4);}catch{}
  var root=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,Margin=Padding.Empty};root.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,310));root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));Controls.Add(root);
  var art=new ArtPanel{Dock=DockStyle.Fill,Margin=Padding.Empty};string image=Path.Combine(home,"app","public","assets","battlefield_2560x1440.png");if(File.Exists(image))art.Artwork=Image.FromFile(image);root.Controls.Add(art,0,0);
  var brand=LabelText("小传说",31,gold,true);brand.BackColor=Color.Transparent;brand.SetBounds(28,44,250,65);art.Controls.Add(brand);
  var english=LabelText("THE LITTLE LEGEND",10,Color.FromArgb(211,221,215),false);english.BackColor=Color.Transparent;english.SetBounds(31,115,250,24);art.Controls.Add(english);
  var caption=LabelText("朋友入席\n传说开场",24,text,true);caption.BackColor=Color.Transparent;caption.SetBounds(30,420,250,110);caption.Anchor=AnchorStyles.Left|AnchorStyles.Bottom;art.Controls.Add(caption);
  var subtitle=LabelText("HOST CONSOLE  /  局域网服务端",9,Color.FromArgb(190,206,202),false);subtitle.BackColor=Color.Transparent;subtitle.SetBounds(31,565,260,26);subtitle.Anchor=AnchorStyles.Left|AnchorStyles.Bottom;art.Controls.Add(subtitle);
  var foot=LabelText("账号 · 对局 · 回放\n都留在你的设备上",10,Color.FromArgb(168,187,183),false);foot.BackColor=Color.Transparent;foot.SetBounds(31,625,245,60);foot.Anchor=AnchorStyles.Left|AnchorStyles.Bottom;art.Controls.Add(foot);
  var body=new TableLayoutPanel{Dock=DockStyle.Fill,Padding=new Padding(32,24,32,20),ColumnCount=1,RowCount=11,Margin=Padding.Empty};foreach(float height in new[]{70f,1f,45f,60f,51f,89f,72f,72f,54f})body.RowStyles.Add(new RowStyle(SizeType.Absolute,height));body.RowStyles.Add(new RowStyle(SizeType.Percent,100));body.RowStyles.Add(new RowStyle(SizeType.Absolute,32));root.Controls.Add(body,1,0);
  var heading=new Panel{Dock=DockStyle.Fill,Margin=Padding.Empty};var title=LabelText("房主控制台",21,text,true);title.SetBounds(0,0,430,42);heading.Controls.Add(title);var description=LabelText("创建一张牌桌，邀请同一网络的朋友加入。",10,muted,false);description.SetBounds(1,44,500,24);heading.Controls.Add(description);var locale=new ComboBox{DropDownStyle=ComboBoxStyle.DropDownList,BackColor=background,ForeColor=text,FlatStyle=FlatStyle.Flat,Anchor=AnchorStyles.Top|AnchorStyles.Right};locale.Items.AddRange(new object[]{"中文","English","日本語"});locale.SetBounds(570,6,110,30);locale.SelectedIndex=language=="en"?1:language=="ja"?2:0;locale.SelectedIndexChanged+=(s,e)=>{language=new[]{"zh-CN","en","ja"}[locale.SelectedIndex];try{Directory.CreateDirectory(Path.GetDirectoryName(languageFile));File.WriteAllText(languageFile,language);}catch{}TranslateControls(this);};heading.Controls.Add(locale);body.Controls.Add(heading);
  body.Controls.Add(new Panel{Dock=DockStyle.Fill,BackColor=line,Margin=Padding.Empty});
  var statusRow=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Margin=Padding.Empty,Padding=new Padding(0,12,0,0)};statusDot.Text="●";statusDot.ForeColor=muted;statusDot.AutoSize=true;statusDot.Margin=new Padding(0,0,7,0);status.Text="未启动";status.AutoSize=true;status.ForeColor=muted;statusRow.Controls.Add(statusDot);statusRow.Controls.Add(status);body.Controls.Add(statusRow);
  var controls=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,Margin=Padding.Empty};controls.RowStyles.Add(new RowStyle(SizeType.Percent,100));controls.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));controls.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,158));controls.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,112));
  var portBox=new Panel{Dock=DockStyle.Fill,Margin=new Padding(0,0,16,0)};var portLabel=LabelText("服务端口",9,muted,false);portLabel.SetBounds(0,0,160,20);portBox.Controls.Add(portLabel);port.BorderStyle=BorderStyle.FixedSingle;port.BackColor=Color.FromArgb(30,40,44);port.ForeColor=text;port.Font=new Font("Segoe UI",12);port.SetBounds(0,24,120,30);port.MaxLength=5;portBox.Controls.Add(port);var auto=LabelText("留空自动分配",9,muted,false);auto.SetBounds(130,28,125,24);portBox.Controls.Add(auto);controls.Controls.Add(portBox);ButtonStyle(start,"启动服务","\uE768",true);ButtonStyle(stop,"停止","\uE71A",false);start.Margin=new Padding(0,19,12,0);stop.Margin=new Padding(0,19,0,0);controls.Controls.Add(start);controls.Controls.Add(stop);body.Controls.Add(controls);
  var addressHeading=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,Margin=Padding.Empty};addressHeading.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));addressHeading.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,235));var joinLabel=LabelText("联机地址",11,text,true);joinLabel.Dock=DockStyle.Fill;joinLabel.TextAlign=ContentAlignment.MiddleLeft;addressHeading.Controls.Add(joinLabel);adapters.Dock=DockStyle.Fill;adapters.Margin=new Padding(0,15,0,6);adapters.DropDownStyle=ComboBoxStyle.DropDownList;adapters.FlatStyle=FlatStyle.Flat;adapters.BackColor=Color.FromArgb(30,40,44);adapters.ForeColor=muted;adapters.Items.Add("等待服务启动");adapters.SelectedIndex=0;adapters.Enabled=false;addressHeading.Controls.Add(adapters);body.Controls.Add(addressHeading);
  var addressPanel=new Panel{Dock=DockStyle.Fill,Margin=Padding.Empty,BackColor=Color.FromArgb(29,40,44),Padding=new Padding(16,13,16,9)};address.BorderStyle=BorderStyle.None;address.ReadOnly=true;address.BackColor=addressPanel.BackColor;address.ForeColor=Color.FromArgb(213,231,225);address.Font=new Font("Segoe UI",19);address.Dock=DockStyle.Top;address.Text="等待开启牌桌";addressPanel.Controls.Add(address);addressNote.Text="启动后，将这里的地址发送给其他玩家。";addressNote.ForeColor=muted;addressNote.Dock=DockStyle.Bottom;addressNote.Height=23;addressNote.Font=new Font(Font.FontFamily,9);addressPanel.Controls.Add(addressNote);body.Controls.Add(addressPanel);
  var metrics=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,Margin=Padding.Empty};for(int i=0;i<3;i++)metrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100f/3));metrics.Controls.Add(Metric("实际端口",portValue));metrics.Controls.Add(Metric("运行时间",uptime));metrics.Controls.Add(Metric("穿透本地目标",tunnelValue));body.Controls.Add(metrics);
  var liveMetrics=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,Margin=Padding.Empty};for(int i=0;i<3;i++)liveMetrics.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100f/3));liveMetrics.Controls.Add(Metric("在线玩家",onlineValue));liveMetrics.Controls.Add(Metric("现存房间",roomsValue));liveMetrics.Controls.Add(Metric("进行中对局",playingValue));body.Controls.Add(liveMetrics);
  var actions=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=5,Margin=Padding.Empty};for(int i=0;i<5;i++)actions.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,20));ButtonStyle(open,"进入牌桌","\uE774",true);ButtonStyle(copy,"复制地址","\uE8C8",false);ButtonStyle(watch,"观战","\uE890",false);ButtonStyle(admin,"管理后台","\uE713",false);var storage=new StudioButton();ButtonStyle(storage,"存档目录","\uE8B7",false);foreach(var button in new[]{open,copy,watch,admin,storage}){button.Margin=new Padding(0,0,8,11);actions.Controls.Add(button);}body.Controls.Add(actions);
  var logPanel=new TableLayoutPanel{Dock=DockStyle.Fill,RowCount=2,ColumnCount=1,Margin=Padding.Empty};logPanel.RowStyles.Add(new RowStyle(SizeType.Absolute,31));logPanel.RowStyles.Add(new RowStyle(SizeType.Percent,100));var logLabel=LabelText("服务记录",10,muted,false);logLabel.Dock=DockStyle.Fill;logPanel.Controls.Add(logLabel);output.Multiline=true;output.ReadOnly=true;output.ScrollBars=ScrollBars.Vertical;output.BorderStyle=BorderStyle.None;output.Dock=DockStyle.Fill;output.BackColor=Color.FromArgb(17,24,27);output.ForeColor=muted;output.Font=new Font("Microsoft YaHei UI",9);logPanel.Controls.Add(output);body.Controls.Add(logPanel);
  var warning=LabelText("停止或退出会断开所有玩家，已保存的对局和账号会保留。",9,muted,false);warning.Dock=DockStyle.Fill;warning.TextAlign=ContentAlignment.BottomLeft;body.Controls.Add(warning);
  start.Click+=(s,e)=>StartHost();stop.Click+=(s,e)=>StopHost();open.Click+=(s,e)=>Open(localUrl);admin.Click+=(s,e)=>Open(adminUrl);watch.Click+=(s,e)=>OpenWatch();copy.Click+=(s,e)=>{Clipboard.SetText(SelectedAddress());Log("联机地址已复制");};storage.Click+=(s,e)=>{Directory.CreateDirectory(store);Process.Start(new ProcessStartInfo(store){UseShellExecute=true});};adapters.SelectedIndexChanged+=(s,e)=>UpdateAddress();clock.Interval=1000;clock.Tick+=(s,e)=>{if(ready){TimeSpan elapsed=DateTime.Now-startedAt;uptime.Text=((int)elapsed.TotalHours).ToString("00")+":"+elapsed.Minutes.ToString("00")+":"+elapsed.Seconds.ToString("00");if(monitorTick++%3==0)RefreshMonitor();}};clock.Start();SetRunning(false);Log("服务就绪。端口留空时由系统分配空闲端口。");
  FormClosing+=(s,e)=>{if(child!=null&&!child.HasExited){if(MessageBox.Show(this,T("停止服务并退出？所有玩家将断线，已保存的数据会保留。"),T("退出小传说"),MessageBoxButtons.YesNo,MessageBoxIcon.Question)!=DialogResult.Yes){e.Cancel=true;return;}StopHost();if(child!=null&&!child.HasExited)e.Cancel=true;}};
  FormClosed+=(s,e)=>{clock.Dispose();if(art.Artwork!=null)art.Artwork.Dispose();};
  heading.Resize+=(s,e)=>{locale.Left=Math.Max(0,heading.ClientSize.Width-locale.Width);};locale.Left=Math.Max(0,heading.ClientSize.Width-locale.Width);
  TranslateControls(this);clock.Tick+=(s,e)=>TranslateControls(this);
 }
 void LoadLanguages(){
  try{foreach(var entry in new JavaScriptSerializer().Deserialize<string[][]>(File.ReadAllText(Path.Combine(home,"app","public","host-languages.json"),Encoding.UTF8)))languages[entry[0]]=new[]{entry[1],entry[2]};}catch{}
  try{language=File.ReadAllText(languageFile).Trim();}catch{}
  if(language!="en"&&language!="ja")language="zh-CN";
 }
 string T(string value){
  if(language=="zh-CN"||String.IsNullOrEmpty(value))return value;
  string[] translated;if(languages.TryGetValue(value,out translated))return translated[language=="en"?0:1];
  string longest=null;foreach(string key in languages.Keys)if(value.StartsWith(key,StringComparison.Ordinal)&&(longest==null||key.Length>longest.Length))longest=key;
  return longest==null?value:languages[longest][language=="en"?0:1]+value.Substring(longest.Length);
 }
 void TranslateControls(Control control){
  if(!(control is TextBox)&&!(control is ComboBox)){
   string[] saved;string raw=languageSources.TryGetValue(control,out saved)&&saved[1]==control.Text?saved[0]:control.Text;
   string translated=T(raw);languageSources[control]=new[]{raw,translated};if(control.Text!=translated)control.Text=translated;
  }
  foreach(Control childControl in control.Controls)TranslateControls(childControl);
 }
 Label LabelText(string value,float size,Color color,bool bold){return new Label{Text=value,Font=new Font("Microsoft YaHei UI",size,bold?FontStyle.Bold:FontStyle.Regular),ForeColor=color,AutoSize=false,Margin=Padding.Empty};}
 Panel Metric(string name,Label value){var panel=new Panel{Dock=DockStyle.Fill,Margin=Padding.Empty};var label=LabelText(name,9,muted,false);label.SetBounds(0,15,220,23);panel.Controls.Add(label);value.Text="—";value.Font=new Font("Segoe UI",13);value.ForeColor=text;value.SetBounds(0,40,230,30);panel.Controls.Add(value);return panel;}
 void ButtonStyle(StudioButton button,string label,string glyph,bool primary){button.Text=label;button.Glyph=glyph;button.Primary=primary;button.Dock=DockStyle.Fill;button.Font=new Font("Microsoft YaHei UI",10,primary?FontStyle.Bold:FontStyle.Regular);}
 string SelectedAddress(){return lanUrls.Length>0&&adapters.SelectedIndex>=0&&adapters.SelectedIndex<lanUrls.Length?lanUrls[adapters.SelectedIndex]:localUrl;}
 void UpdateAddress(){if(!ready)return;address.Text=SelectedAddress();addressNote.Text=lanUrls.Length>0?"其他玩家在浏览器打开此地址，无需安装软件。":"未检测到局域网地址，请连接 Wi-Fi 或网线后重启服务。";}
 void SetStatus(string message,Color color){status.Text=message;status.ForeColor=statusDot.ForeColor=color;}
 void Open(string url){try{if(url!=null){var uri=new UriBuilder(url);uri.Query=(uri.Query.Length>1?uri.Query.Substring(1)+"&":"")+"lang="+language;Process.Start(new ProcessStartInfo(uri.Uri.AbsoluteUri){UseShellExecute=true});}}catch(Exception e){Log(e.Message);}}
 void Log(string message){if(output.TextLength>40000)output.Text=output.Text.Substring(output.TextLength-20000);output.AppendText("  "+DateTime.Now.ToString("HH:mm:ss")+"   "+T(message)+Environment.NewLine);}
 void Dispatch(Action action){if(IsDisposed||Disposing)return;try{BeginInvoke(action);}catch(InvalidOperationException){}}
 Dictionary<string,object> HostApi(string baseUrl,string route,bool post){
  var request=(HttpWebRequest)WebRequest.Create(baseUrl+route);request.Proxy=null;request.Timeout=2500;request.ReadWriteTimeout=2500;
  request.Headers["X-Admin-Key"]=File.ReadAllText(Path.Combine(store,"admin.key")).Trim();
  if(post){request.Method="POST";request.ContentType="application/json";byte[] body=Encoding.UTF8.GetBytes("{}");request.ContentLength=body.Length;using(var stream=request.GetRequestStream())stream.Write(body,0,body.Length);}
  using(var response=request.GetResponse())using(var reader=new StreamReader(response.GetResponseStream(),Encoding.UTF8))return new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(reader.ReadToEnd());
 }
 async void RefreshMonitor(){
  if(!ready||monitorBusy)return;monitorBusy=true;var source=child;string url=localUrl;
  try{var data=await Task.Run(()=>HostApi(url,"/api/admin/live",false));if(!ready||child!=source)return;onlineValue.Text=Convert.ToString(data["online"]);roomsValue.Text=Convert.ToString(data["rooms"]);playingValue.Text=Convert.ToString(data["playing"]);}
  catch{if(ready&&child==source)onlineValue.Text=roomsValue.Text=playingValue.Text="—";}
  finally{monitorBusy=false;}
 }
 async void OpenWatch(){
  if(!ready)return;watch.Enabled=false;var source=child;string url=localUrl;
  try{var data=await Task.Run(()=>HostApi(url,"/api/admin/gm-ticket",true));if(ready&&child==source)Open(url+"/gz.html#ticket="+Uri.EscapeDataString((string)data["ticket"]));}
  catch(Exception error){Log("无法打开观战："+error.Message);}
  finally{watch.Enabled=ready;}
 }
 void StartHost(){
  int n;if(port.Text.Trim()!=""&&(!int.TryParse(port.Text.Trim(),out n)||n<1||n>65535)){MessageBox.Show(this,T("端口请输入 1–65535，留空自动分配。"),T("端口无效"),MessageBoxButtons.OK,MessageBoxIcon.Information);return;}
  try{
   string node=Path.Combine(home,"runtime","node.exe"),app=Path.Combine(home,"app");if(!File.Exists(node))throw new Exception("缺少 runtime/node.exe，请使用完整发布文件夹");if(!File.Exists(Path.Combine(app,"host-runner.js")))throw new Exception("缺少游戏服务文件");
   var info=new ProcessStartInfo(node,"host-runner.js"){WorkingDirectory=app,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,RedirectStandardInput=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};info.EnvironmentVariables["PORT"]=port.Text.Trim();info.EnvironmentVariables["XCS_DATA_DIR"]=store;info.EnvironmentVariables["XCS_HOST_UI"]="1";
   child=new Process{StartInfo=info,EnableRaisingEvents=true};var launched=child;child.OutputDataReceived+=(s,e)=>Receive(launched,e.Data);child.ErrorDataReceived+=(s,e)=>Receive(launched,e.Data);child.Exited+=(s,e)=>Dispatch(()=>{if(child==launched){child=null;SetRunning(false);Log("服务已停止，存档已保留。");}});
   SetRunning(true);SetStatus("正在启动",gold);Log("正在启动局域网服务…");child.Start();child.BeginOutputReadLine();child.BeginErrorReadLine();
  }catch(Exception e){child=null;SetRunning(false);SetStatus("启动失败",Color.FromArgb(232,147,136));Log(e.Message);MessageBox.Show(this,T(e.Message),T("无法启动"),MessageBoxButtons.OK,MessageBoxIcon.Warning);}
 }
 void Receive(Process source,string raw){if(raw==null)return;Dispatch(()=>{if(child!=source)return;try{var serializer=new JavaScriptSerializer();var data=serializer.Deserialize<Dictionary<string,object>>(raw);if((string)data["type"]=="started"){
   localUrl=(string)data["localUrl"];adminUrl=(string)data["adminUrl"];lanUrls=serializer.ConvertToType<string[]>(data["lanUrls"]);ready=true;startedAt=DateTime.Now;portValue.Text=Convert.ToString(data["port"]);tunnelValue.Text=(string)data["tunnelTarget"];uptime.Text="00:00:00";adapters.Items.Clear();for(int i=0;i<lanUrls.Length;i++)adapters.Items.Add("网卡 "+(i+1)+"  ·  "+new Uri(lanUrls[i]).Host);if(lanUrls.Length==0)adapters.Items.Add("仅本机地址");adapters.SelectedIndex=0;adapters.Enabled=lanUrls.Length>1;UpdateAddress();SetStatus("服务运行中",Color.FromArgb(132,204,173));open.Enabled=admin.Enabled=watch.Enabled=true;copy.Enabled=lanUrls.Length>0;RefreshMonitor();Log("服务启动成功 · 端口 "+data["port"]);Log("本机："+localUrl);foreach(string url in lanUrls)Log("局域网："+url);Log("存档："+data["dataDir"]);
  }else{SetStatus("服务错误",Color.FromArgb(232,147,136));Log((string)data["message"]);}}catch{Log(raw);}});}
 void SetRunning(bool running){ready=false;start.Enabled=port.Enabled=!running;stop.Enabled=running;open.Enabled=copy.Enabled=admin.Enabled=watch.Enabled=adapters.Enabled=false;onlineValue.Text=roomsValue.Text=playingValue.Text="—";if(!running){SetStatus("未启动",muted);portValue.Text=uptime.Text=tunnelValue.Text="—";address.Text="等待开启牌桌";addressNote.Text="启动后，将这里的地址发送给其他玩家。";}}
 void StopHost(){var running=child;if(running==null)return;try{if(!running.HasExited){SetStatus("正在停止",gold);running.StandardInput.WriteLine("stop");running.StandardInput.Flush();if(!running.WaitForExit(5000)){Log("服务尚未退出，请稍候再试；未强制终止。");return;}}if(running.HasExited){child=null;SetRunning(false);Log("服务已停止，存档已保留。");}}catch(Exception e){Log(e.Message);}}
 [STAThread]static void Main(){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);Application.Run(new Launcher());}
}
