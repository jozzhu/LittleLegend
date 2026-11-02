// Copyright (C) 2026 jozzhu
// SPDX-License-Identifier: AGPL-3.0-or-later

using System;
using System.IO;
using System.Drawing;
using System.Reflection;
using System.Windows.Forms;
using System.Threading;
using System.Net;
class Preview {
 [STAThread]static void Main(string[] args){try{Run(args);}catch(Exception error){File.WriteAllText(args[0]+".error.txt",error.GetType().FullName+"\n"+error.Message+"\n"+error.StackTrace);Environment.ExitCode=1;}}
 static void Run(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  var assembly=Assembly.LoadFrom(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"LittleLegendHost.exe"));
  using(var form=(Form)Activator.CreateInstance(assembly.GetType("Launcher"),true)){
   form.ShowInTaskbar=false;form.StartPosition=FormStartPosition.Manual;form.Location=new Point(-16000,-16000);form.Show();Application.DoEvents();form.PerformLayout();Application.DoEvents();
   if(args.Length>1&&args[1]=="--smoke"){
    string data=Path.Combine(Path.GetTempPath(),"LegendLauncherTest-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(data);var type=form.GetType();
    type.GetField("store",BindingFlags.NonPublic|BindingFlags.Instance).SetValue(form,data);
    try{
     ((Button)type.GetField("start",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(form)).PerformClick();
     DateTime until=DateTime.Now.AddSeconds(12);while(!(bool)type.GetField("ready",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(form)&&DateTime.Now<until){Application.DoEvents();Thread.Sleep(50);}
     if(!(bool)type.GetField("ready",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(form))throw new Exception("Launcher did not become ready");
     string url=(string)type.GetField("localUrl",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(form);using(var web=new WebClient()){web.Encoding=System.Text.Encoding.UTF8;if(!web.DownloadString(url).Contains("小传说"))throw new Exception("Game HTTP smoke test failed");}
     var onlineField=type.GetField("onlineValue",BindingFlags.NonPublic|BindingFlags.Instance);
     if(onlineField!=null){
      DateTime monitorUntil=DateTime.Now.AddSeconds(6);
      while(((Label)onlineField.GetValue(form)).Text!="0"&&DateTime.Now<monitorUntil){Application.DoEvents();Thread.Sleep(50);}
      foreach(string field in new[]{"onlineValue","roomsValue","playingValue"})if(((Label)type.GetField(field,BindingFlags.NonPublic|BindingFlags.Instance).GetValue(form)).Text!="0")throw new Exception("Launcher live counts did not refresh");
      Console.WriteLine("LAUNCHER_LIVE_COUNTS_OK");
      using(var web=new WebClient()){web.Encoding=System.Text.Encoding.UTF8;if(!web.DownloadString(url+"/gz.html").Contains("gm-watch"))throw new Exception("GM page HTTP smoke failed");}
     }
     using(var image=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(image,new Rectangle(Point.Empty,form.Size));image.Save(args[0],System.Drawing.Imaging.ImageFormat.Png);}
     Console.WriteLine("LAUNCHER_START_AND_HTTP_OK "+url);
    }finally{type.GetMethod("StopHost",BindingFlags.NonPublic|BindingFlags.Instance).Invoke(form,null);Application.DoEvents();if(type.GetField("child",BindingFlags.NonPublic|BindingFlags.Instance).GetValue(form)!=null)throw new Exception("Launcher did not stop child process");Directory.Delete(data,true);}
    Console.WriteLine("LAUNCHER_STOP_OK");
   }else using(var image=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(image,new Rectangle(Point.Empty,form.Size));image.Save(args[0],System.Drawing.Imaging.ImageFormat.Png);}form.Close();
  }
 }
}
