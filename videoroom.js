"use strict";
//import Janus from './janus'

function Member(id, name) {
  this.id = id;
  this.name = name;
}

function Media(audio, video, data) {
  this.audio = audio;
  this.video = video;
  this.data = data;
}

function BitRate() {
  this.value = "0 kbits/sec";
  this.bsnow = null;
  this.bsbefore - null;
  this.tsnow = null;
  this.tsbefore = null;
}

function VideoRoom(server) {
  this.sfutest = null;
  this.opaqueId = "vroomtest-" + Janus.randomString(12);
  this.myinfo = new Member();
  this.mystream = null;
  this.multirecv = null;
  this.useMultiRecv = adapter.browserDetails.browser === "chrome" || CC_JSB;
  // We use this other ID just to map our subscriptions to us
  this.mypvtid = null;
  this.myroom = 1234;
  this.members = [];
  this.medias = [];
  this.closed = false;
  // Event
  this.onConnected = Janus.noop; // server connected
  this.onDisconnected = Janus.noop; // server disconnect
  this.onError = Janus.noop;
  this.onJoinRoom = Janus.noop; // Member
  this.onMemberEnter = Janus.noop; // Member
  this.onMemberLeave = Janus.noop; // Member
  this.onLocalStream = Janus.noop; // steam
  this.onAddStream = Janus.noop; // id,stream
  this.onRemoveStream = Janus.noop; // id,stream
  this.onRoomClose = Janus.noop; // roomid
  this.consentDialog = Janus.noop;
  this.webrtcState = Janus.noop;
  var room = this;
  this.janus = new Janus({
    server: server,
    success: function () {
      // room.onConnected();
      // Attach to video room test plugin
      room.janus.attach({
        plugin: "janus.plugin.videoroom",
        opaqueId: room.opaqueId,
        success: function (pluginHandle) {
          room.sfutest = pluginHandle;
          Janus.log(
            "publisher attached! (" +
              pluginHandle.getPlugin() +
              ", id=" +
              pluginHandle.getId() +
              ")"
          );
          room.onConnected();
        },
        error: function (error) {
          Janus.error("  -- Error attaching publisher...", error);
          room.onError(error);
          room.FireClose("publisher attach error");
        },
        consentDialog: room.consentDialog,
        mediaState: function (medium, on) {
          Janus.log(
            "Janus " + (on ? "started" : "stopped") + " receiving our " + medium
          );
        },
        webrtcState: function (on) {
          Janus.log(
            "Janus says our WebRTC PeerConnection is " +
              (on ? "up" : "down") +
              " now"
          );
          room.webrtcState(on);
        },
        iceState: function (stat) {
          console.log("iceStat", stat);
          if (stat == "failed")
            // || stat == "disconnected" || stat == "closed")
            room.FireClose("iceDisconnect " + stat);
        },
        onmessage: function (msg, jsep) {
          var event = msg["videoroom"];
          Janus.debug("publisher." + event + "> ", JSON.stringify(msg));
          if (event != undefined && event != null) {
            if (event === "destroyed") {
              // The room has been destroyed
              Janus.warn("The room has been destroyed!");
              room.onRoomClose(room.myroom, event);
            } else if (event === "event") {
              // Any new feed to attach to?
              if (
                msg["publishers"] !== undefined &&
                msg["publishers"] !== null
              ) {
                var list = msg["publishers"];
                Janus.debug("Got a list of available publishers/feeds:");
                Janus.debug(list);
                for (var f in list) {
                  var id = list[f]["id"];
                  var display = list[f]["display"];
                  Janus.log("onMemberEnter: " + id + "," + display);
                  var member = new Member(id, display);
                  room.members[id] = member;
                  room.onMemberEnter(member);
                }
              } else if (
                msg["leaving"] !== undefined &&
                msg["leaving"] !== null
              ) {
                // One of the publishers has gone away?
                var leaving = msg["leaving"];
                Janus.log("onMemberLeave: " + leaving);
                var member = room.members[leaving];
                if (member) {
                  if (member.feed) member.feed.detach();
                  room.members[leaving] = null;
                  room.medias[leaving] = null;
                  room.onMemberLeave(member);
                }
              } else if (
                msg["unpublished"] !== undefined &&
                msg["unpublished"] !== null
              ) {
                // One of the publishers has unpublished?
                var unpublished = msg["unpublished"];
                Janus.log("Publisher left: " + unpublished);
                if (unpublished === "ok") {
                  // That's us
                  // room.sfutest.hangup();
                  return;
                }
                var member = room.members[unpublished];
                if (member) {
                  if (member.feed) member.feed.detach();
                  room.members[unpublished] = null;
                  room.medias[unpublished] = null;
                  room.onMemberLeave(member);
                }
              } else if (msg["error"] !== undefined && msg["error"] !== null) {
                Janus.warn(msg["error"]);
                room.onError(msg["error"]);
              }
            }
          }
          if (jsep !== undefined && jsep !== null) {
            Janus.debug("Handling SDP as well...", jsep);
            room.sfutest.handleRemoteJsep({ jsep: jsep });
          }
        },
        onlocalstream: function (stream) {
          Janus.debug(" ::: Got a local stream :::", JSON.stringify(stream));
          room.mystream = stream;
          room.onLocalStream(stream);
        },
        onremotestream: function (stream) {
          // The publisher stream is sendonly, we don't expect anything here
        },
        oncleanup: function () {
          Janus.log(
            " ::: Got a cleanup notification: we are unpublished now :::"
          );
          room.mystream = null;
          // room.onRoomClose(room.myroom);
        },
      });
    },
    error: function (error) {
      Janus.error("create session error", error);
      if (!room.janus.isConnected()) room.FireClose(error);
    },
    destroyed: function () {
      // 这应该是主动退出回调
      room.FireClose();
    },
  });
}

VideoRoom.prototype.Join = function (roomid, username, pub = false) {
  this.closed = false;
  this.myroom = roomid;
  this.myinfo.name = username;
  Janus.log("join with " + roomid + ", username=" + username + ",pub=" + pub);
  var register = {
    request: "join",
    room: this.myroom,
    ptype: "publisher",
    display: username,
  };
  if (pub) {
    register["public"] = true;
  }
  var room = this;
  this.sfutest.send({
    message: register,
    success: function (msg) {
      Janus.log("join resp", JSON.stringify(msg));
      if (msg["videoroom"] === "joined") {
        // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
        room.myinfo.id = msg["id"];
        room.mypvtid = msg["private_id"];
        Janus.log(
          "Successfully joined room " +
            msg["room"] +
            " with ID " +
            msg["id"] +
            ", Display " +
            room.myinfo.name
        );
        if (room.useMultiRecv) room.newMultiRecv();
        room.onJoinRoom(room.myinfo);
        // Any new feed to attach to?
        if (msg["publishers"] !== undefined && msg["publishers"] !== null) {
          var list = msg["publishers"];
          Janus.debug("Got a list of available publishers/feeds:");
          Janus.debug(list);
          for (var f in list) {
            var id = list[f]["id"];
            var display = list[f]["display"];
            Janus.log("GotMember: " + id + "," + display);
            var member = new Member(id, display);
            room.members[id] = member;
            room.onMemberEnter(member);
          }
        }
      }
    },
    error: function (err) {
      Janus.log("join error", err);
      room.FireClose("join error " + err);
    },
  });
};

VideoRoom.prototype.Publish = function (audio, video = true) {
  Janus.log("Publish audio=" + audio + ",video=" + video);
  // Publish our stream
  var sfutest = this.sfutest;
  sfutest.createOffer({
    // Add data:true here if you want to publish datachannels as well
    media: {
      audioRecv: false,
      videoRecv: false,
      audioSend: audio,
      videoSend: video,
    },
    success: function (jsep) {
      Janus.debug("Got publisher SDP!");
      Janus.debug(jsep);
      var publish = { request: "configure", audio: audio, video: video };
      // You can force a specific codec to use when publishing by using the
      // audiocodec and videocodec properties, for instance:
      // 		publish["audiocodec"] = "opus"
      // to force Opus as the audio codec to use, or:
      // 		publish["videocodec"] = "vp9"
      // to force VP9 as the videocodec to use. In both case, though, forcing
      // a codec will only work if: (1) the codec is actually in the SDP (and
      // so the browser supports it), and (2) the codec is in the list of
      // allowed codecs in a room. With respect to the point (2) above,
      // refer to the text in janus.plugin.videoroom.cfg for more details
      sfutest.send({ message: publish, jsep: jsep });
    },
    error: function (error) {
      Janus.error("WebRTC error:", error);
      Janus.warn("publish error", error);
    },
  });
  return true;
};

VideoRoom.prototype.UnPublish = function (cb) {
  Janus.log("UnPublish");
  var room = this;
  this.sfutest.send({
    message: { request: "unpublish" },
    success: function (data) {
      // msg["unpublished"] == "ok"
      room.sfutest.hangup();
      if (cb) cb();
    },
    error: function (error) {
      Janus.warn("unpublish error", error);
    },
  });
};

VideoRoom.prototype.FireClose = function (msg) {
  Janus.log("FilreClose", msg);
  if (!this.closed) {
    this.onDisconnected(msg);
    this.closed = true;
  }
};

VideoRoom.prototype.Close = function (cb) {
  Janus.log("Close");
  if (this.mystream && this.mystream.release) {
    this.mystream.release();
    //delete this.mystream;
  }
  if (this.sfutest) {
    this.sfutest.detach();
  }
  if (this.multirecv) {
    this.multirecv.detach();
  } else {
    for (var mid in this.members) {
      if (this.members[mid].feed) this.members[mid].feed.detach();
    }
  }
};

VideoRoom.prototype.Configure = function (conf) {
  var msg = { request: "configure" };
  if (conf.hasOwnProperty("bitrate")) msg.bitrate = conf.bitrate;
  if (conf.hasOwnProperty("public")) msg.public = conf.public;
  if (conf.hasOwnProperty("audio")) msg.audio = conf.audio;
  if (conf.hasOwnProperty("video")) msg.video = conf.video;
  if (conf.hasOwnProperty("data")) msg.data = conf.data;
  Janus.log("Configure " + JSON.stringify(msg));
  this.sfutest.send({
    message: msg,
    success: function (data) {
      Janus.warn("Configure ok");
    },
    error: function (error) {
      Janus.warn("Configure error", error);
    },
  });
};

VideoRoom.prototype.isAudioMuted = function () {
  return this.sfutest.isAudioMuted();
};

VideoRoom.prototype.setAudioMuted = function (mute) {
  Janus.log("setAudioMuted " + mute);
  if (mute) {
    this.sfutest.muteAudio();
  } else {
    this.sfutest.unmuteAudio();
  }
};

VideoRoom.prototype.destroy = function () {
  Janus.log("destroy");
  return this.janus.destroy();
};

VideoRoom.prototype.getMember = function (id) {
  id = parseInt(id);
  return this.members[id];
};

VideoRoom.prototype.getMemberMedia = function (id) {
  id = parseInt(id);
  return this.medias[id];
};

VideoRoom.prototype.setMemberMedia = function (id, media) {
  id = parseInt(id);
  if (!this.members[id]) {
    Janus.warn("not such user", id);
    return false;
  }
  Janus.log(
    "setMemberMedia " +
      id +
      " audio=" +
      media.audio +
      ",video=" +
      media.video +
      ",data=" +
      media.data
  );
  if (this.useMultiRecv) {
    if (this.multirecv) this.multirecv.Configure(id, media);
    else this.medias[id] = media;
  } else {
    if (this.members[id].feed) {
      this.members[id].feed.Configure(mi);
    } else {
      this.newRemoteFeed(id, media);
    }
  }
  return true;
};

VideoRoom.prototype.getBitrate = function (id) {
  if (this.useMultiRecv) {
    return this.multirecv.getBitrate(id);
  } else if (this.members[id].feed) {
    return this.members[id].feed.getBitrate();
  }
};

VideoRoom.prototype.newRemoteFeed = function (id, media) {
  // A new feed has been published, create a new plugin handle and attach to it as a listener
  var remoteFeed = null;
  var room = this;
  room.janus.attach({
    plugin: "janus.plugin.videoroom",
    opaqueId: room.opaqueId,
    success: function (pluginHandle) {
      remoteFeed = pluginHandle;
      remoteFeed.Configure = function (meida) {
        if (!mi || (!mi.audio && !mi.video && !mi.data)) {
          Janus.log("subscriber." + id + " hangup");
          remoteFeed.hangup();
          room.members[id].feed = null;
          room.medias[id] = null;
        } else {
          var config = {
            request: "configure",
            room: room.myroom,
            audio: media.audio,
            video: media.video,
            data: media.data,
          };
          remoteFeed.send({
            message: config,
            success: function (data) {
              Janus.log(
                "subscriber." + id + " config",
                media,
                "success " + data
              );
              room.medias[id] = media;
            },
            error: function (err) {
              Janus.log("subscriber." + id + " config error " + err);
            },
          });
        }
      };
      room.members[id].feed = remoteFeed;
      Janus.log(
        "subscriber." +
          id +
          " attached! (" +
          remoteFeed.getPlugin() +
          ", id=" +
          remoteFeed.getId() +
          ")"
      );
      // We wait for the plugin to send us an offer
      var listen = {
        request: "joinandconfigure",
        room: room.myroom,
        ptype: "listener",
        feed: id,
        private_id: room.mypvtid,
        audio: media.audio,
        video: media.video,
        data: media.data,
      };
      remoteFeed.send({
        message: listen,
        success: function (data) {
          Janus.log("subscriber." + id + " join ok");
          room.medias[id] = media;
        },
        error: function (err) {
          Janus.warn("subscriber." + id + " join error " + err);
          room.onError(err);
        },
      });
    },
    error: function (error) {
      Janus.error("subscriber." + id + " attach error:" + error);
      room.onError(error);
    },
    onmessage: function (msg, jsep) {
      var event = msg["videoroom"];
      Janus.debug("subscriber." + id + ">" + event + ":", JSON.stringify(msg));
      if (event != undefined && event != null) {
        if (event === "attached") {
          remoteFeed.rfid = msg["id"];
          remoteFeed.rfdisplay = msg["display"];
          Janus.log(
            "Successfully attached to feed " +
              remoteFeed.rfid +
              " (" +
              remoteFeed.rfdisplay +
              ") in room " +
              msg["room"]
          );
        } else if (msg["error"] !== undefined && msg["error"] !== null) {
          Janus.error("error:", msg["error"]);
          room.onError(error);
        }
      }
      if (jsep !== undefined && jsep !== null) {
        Janus.debug("Handling SDP as well...");
        Janus.debug(jsep);
        // Answer and attach
        remoteFeed.createAnswer({
          jsep: jsep,
          // Add data:true here if you want to subscribe to datachannels as well
          // (obviously only works if the publisher offered them in the first place)
          media: { audioSend: false, videoSend: false },
          success: function (jsep) {
            Janus.debug("Got SDP!", jsep);
            var body = { request: "start", room: room.myroom };
            remoteFeed.send({ message: body, jsep: jsep });
          },
          error: function (error) {
            Janus.error("WebRTC error:", error);
            //bootbox.alert("WebRTC error... " + JSON.stringify(error));
            room.onError(error);
          },
        });
      }
    },
    webrtcState: function (on) {
      Janus.log(
        "Janus says this subscriber PeerConnection " +
          id +
          "(" +
          remoteFeed.rfdisplay +
          ") is " +
          (on ? "up" : "down") +
          " now"
      );
    },
    iceState: function (stat) {
      console.log("subscriber." + id + " iceStat " + stat);
    },
    onlocalstream: function (stream) {
      // The subscriber stream is recvonly, we don't expect anything here
    },
    onremotestream: function (stream) {
      room.onAddStream(id, stream);
    },
    onremovestream: function (stream) {
      room.onRemoveStream(id);
    },
    oncleanup: function () {
      Janus.log("subscriber." + id + " got a cleanup notification :::");
    },
  });
};

VideoRoom.prototype.newMultiRecv = function () {
  // A new feed has been published, create a new plugin handle and attach to it as a listener
  var multirecv = null;
  var room = this;
  room.janus.attach({
    plugin: "janus.plugin.videoroom",
    opaqueId: room.opaqueId,
    success: function (pluginHandle) {
      multirecv = pluginHandle;
      multirecv.Configure = function (id, media) {
        var config = {
          request: "configure",
          room: room.myroom,
          feed: parseInt(id),
          audio: media.audio,
          video: media.video,
          data: media.data,
        };
        multirecv.send({
          message: config,
          success: function (data) {
            Janus.log("multirecv configure " + id + " success");
            room.medias[id] = media;
          },
          error: function (err) {
            Janus.warn("multirecv configure " + id + " error" + err);
          },
        });
      };
      multirecv.getBitrate = function (id) {
        if (
          pluginHandle === null ||
          pluginHandle === undefined ||
          pluginHandle.webrtcStuff === null ||
          pluginHandle.webrtcStuff === undefined
        ) {
          return "Invalid handle";
        }
        var config = pluginHandle.webrtcStuff;
        if (config.pc === null || config.pc === undefined)
          return "Invalid PeerConnection";
        // Start getting the bitrate, if getStats is supported
        if (config.pc.getStats) {
          // http://webrtc.googlecode.com/svn/trunk/samples/js/demos/html/constraints-and-stats.html
          if (
            config.bitrate.timer === null ||
            config.bitrate.timer === undefined
          ) {
            Janus.log("multirecv Starting bitrate timer (Chrome)");
            multirecv.bitrates = {};
            config.bitrate.timer = setInterval(function () {
              config.pc.getStats(function (stats) {
                var results = stats.result();
                for (var i = 0; i < results.length; i++) {
                  var res = results[i];
                  if (
                    res.type == "ssrc" &&
                    res.stat("googFrameHeightReceived")
                  ) {
                    var tid = res.stat("googTrackId");
                    if (tid.length > 5 && tid.substr(0, 3) == "sfu")
                      tid = tid.substr(3, tid.length - 5);
                    if (!multirecv.bitrates[tid]) {
                      multirecv.bitrates[tid] = new BitRate();
                    }
                    var bitrate = multirecv.bitrates[tid];
                    bitrate.bsnow = res.stat("bytesReceived");
                    bitrate.tsnow = res.timestamp;
                    if (
                      bitrate.bsbefore === null ||
                      bitrate.tsbefore === null
                    ) {
                      // Skip this round
                      bitrate.bsbefore = bitrate.bsnow;
                      bitrate.tsbefore = bitrate.tsnow;
                    } else {
                      // Calculate bitrate
                      var bitRate = Math.round(
                        ((bitrate.bsnow - bitrate.bsbefore) * 8) /
                          (bitrate.tsnow - bitrate.tsbefore)
                      );
                      bitrate.value = bitRate + " kbits/sec";
                      //~ Janus.log("Estimated bitrate is " + config.bitrate.value);
                      bitrate.bsbefore = bitrate.bsnow;
                      bitrate.tsbefore = bitrate.tsnow;
                    }
                  }
                }
              });
            }, 1000);
          }
          if (multirecv.bitrates[id]) return multirecv.bitrates[id].value;
          else return "0 kbits/sec";
        } else {
          Janus.warn("Getting the video bitrate unsupported by browser");
          return "Feature unsupported by browser";
        }
      };
      multirecv.Join = function () {
        multirecv.send({
          message: {
            request: "join",
            room: room.myroom,
            ptype: "muxed-listener",
            private_id: room.mypvtid,
          },
          success: function (msg) {
            if (msg["videoroom"] === "muxed-created") {
              Janus.log("multirecv join success with room " + msg["room"]);
              //send "add" to server
              var idx = 0;
              var msg = { request: "add", room: room.myroom, listeners: [] };
              for (var id in room.medias) {
                var mi = room.medias[id];
                msg["listeners"][idx++] = {
                  feed: parseInt(id),
                  audio: mi.audio,
                  video: mi.video,
                  data: mi.data,
                };
              }
              if (idx > 0) {
                Janus.log("multirecv add pending feeds", JSON.stringify(msg));
                multirecv.send({
                  message: msg,
                  success: function (resp) {
                    Janus.log("multirecv configure pending feeds success");
                  },
                  error: function (err) {
                    Janus.warn("multirecv configure pending feeds error", err);
                  },
                });
              }
            }
          },
          error: function (err) {
            var msg = "multirecv join error" + err;
            Janus.warn(msg);
            room.FireClose(msg);
          },
        });
      };
      room.multirecv = pluginHandle;
      Janus.log(
        "multirecv Plugin attached! (" +
          multirecv.getPlugin() +
          ", id=" +
          multirecv.getId() +
          ")"
      );
      // We wait for the plugin to send us an offer
      multirecv.Join();
    },
    error: function (error) {
      Janus.error("  -- Error attaching multirecv...", error);
      //bootbox.alert("Error attaching plugin... " + error);
      room.FireClose("multirecv attach error:" + error);
    },
    onmessage: function (msg, jsep) {
      var event = msg["videoroom"];
      Janus.debug("multirecv." + event + "> ", JSON.stringify(msg));
      if (event != undefined && event != null) {
        if (event === "attached") {
          Janus.log(
            "Successfully attached to multirecv in room " + msg["room"]
          );
        } else if (msg["error"] !== undefined && msg["error"] !== null) {
          Janus.error("error:", msg["error"]);
          room.onError(msg["error"]);
        }
      }
      if (jsep !== undefined && jsep !== null) {
        Janus.debug("Handling SDP as well...", jsep);
        // Answer and attach
        multirecv.createAnswer({
          jsep: jsep,
          // Add data:true here if you want to subscribe to datachannels as well
          // (obviously only works if the publisher offered them in the first place)
          media: { audioSend: false, videoSend: false },
          success: function (jsep) {
            Janus.debug("Got SDP!", jsep);
            var body = { request: "start", room: room.myroom };
            multirecv.send({ message: body, jsep: jsep });
          },
          error: function (error) {
            Janus.error("WebRTC error:", error);
            //bootbox.alert("WebRTC error... " + JSON.stringify(error));
            room.onError(msg["error"]);
          },
        });
      }
    },
    webrtcState: function (on) {
      Janus.log(
        "Janus says this WebRTC multirecv PeerConnection is " +
          (on ? "up" : "down") +
          " now"
      );
    },
    iceState: function (stat) {
      console.log("multirecv iceStat", stat);
      if (stat == "failed")
        // || stat == "disconnected" || stat == "closed")
        room.FireClose("iceDisconnect " + stat);
    },
    onlocalstream: function (stream) {
      // The subscriber stream is recvonly, we don't expect anything here
    },
    onremotestream: function (stream) {
      var id = stream.id;
      if (id.length > 4 && id.substr(0, 3) == "sfu") {
        id = id.substr(3);
        Janus.log("onaddstream", id, stream);
        room.onAddStream(id, stream);
      }
    },
    onremovestream: function (stream) {
      var id = stream.id;
      if (id.length > 4 && id.substr(0, 3) == "sfu") {
        id = id.substr(3);
        Janus.log("ondelstream", id, stream);
        room.onRemoveStream(id, stream);
      }
    },
    oncleanup: function () {
      Janus.log(" ::: Got a multirecv cleanup notification :::");
      if (multirecv) multirecv.bitrates = {};
    },
  });
};
