#include <jni.h>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>
#include <unistd.h>
#include "node.h"

extern "C" JNIEXPORT jint JNICALL
Java_asia_littlelegend_host_HostService_startNode(JNIEnv* env, jclass, jstring game, jstring data, jstring port, jstring status, jstring stop) {
 auto text=[env](jstring value){const char* raw=env->GetStringUTFChars(value,nullptr);std::string result(raw);env->ReleaseStringUTFChars(value,raw);return result;};
 const auto gamePath=text(game),dataPath=text(data),portText=text(port),statusPath=text(status),stopPath=text(stop);
 setenv("XCS_DATA_DIR",dataPath.c_str(),1);setenv("PORT",portText.c_str(),1);
 setenv("XCS_HOST_STATUS",statusPath.c_str(),1);setenv("XCS_STOP_FILE",stopPath.c_str(),1);
 chdir(gamePath.c_str());
 // Node requires mutable argument storage for the lifetime of its event loop.
 const std::string script=gamePath+"/host-runner.js";
 std::vector<char> arguments(5+script.size()+1);std::memcpy(arguments.data(),"node",5);std::memcpy(arguments.data()+5,script.c_str(),script.size()+1);
 char* argv[]={arguments.data(),arguments.data()+5,nullptr};
 return node::Start(2,argv);
}
