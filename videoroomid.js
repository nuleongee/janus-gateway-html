// We make use of this 'server' variable to provide the address of the
// REST Janus API. By default, in this example we assume that Janus is
// co-located with the web server hosting the HTML pages but listening
// on a different port (8088, the default for HTTP in Janus), which is
// why we make use of the 'window.location.hostname' base address. Since
// Janus can also do HTTPS, and considering we don't really want to make
// use of HTTP for Janus if your demos are served on HTTPS, we also rely
// on the 'window.location.protocol' prefix to build the variable, in
// particular to also change the port used to contact Janus (8088 for
// HTTP and 8089 for HTTPS, if enabled).
// In case you place Janus behind an Apache frontend (as we did on the
// online demos at http://janus.conf.meetecho.com) you can just use a
// relative path for the variable, e.g.:
//
// 		var server = "/janus";
//
// which will take care of this on its own.
//
//
// If you want to use the WebSockets frontend to Janus, instead, you'll
// have to pass a different kind of address, e.g.:
//
// 		var server = "ws://" + window.location.hostname + ":8188";
//
// Of course this assumes that support for WebSockets has been built in
// when compiling the gateway. WebSockets support has not been tested
// as much as the REST API, so handle with care!
//
//
// If you have multiple options available, and want to let the library
// autodetect the best way to contact your gateway (or pool of gateways),
// you can also pass an array of servers, e.g., to provide alternative
// means of access (e.g., try WebSockets first and, if that fails, fall
// back to plain HTTP) or just have failover servers:
//
//		var server = [
//			"ws://" + window.location.hostname + ":8188",
//			"/janus"
//		];
//
// This will tell the library to try connecting to each of the servers
// in the presented order. The first working server will be used for
// the whole session.
//
var server = "wss://inelab.kr:8989";
//if(window.location.protocol === 'http:')
//     server = "http://" + window.location.hostname + ":8088/janus";
// else
//     server = "https://" + window.location.hostname + ":8089/janus";

var videoroom = null;
var started = false;
var feeds = []; // Member + timer + spin

function consentDialog(on) {
  Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
  if (on) {
    // Darken screen and show hint
    $.blockUI({
      message: '<div><img src="up_arrow.png"/></div>',
      css: {
        border: "none",
        padding: "15px",
        backgroundColor: "transparent",
        color: "#aaa",
        top: "10px",
        left: navigator.mozGetUserMedia ? "-100px" : "300px",
      },
    });
  } else {
    // Restore screen
    $.unblockUI();
  }
}

function onError(err) {
  bootbox.alert(err);
}

function onDisconnected(msg) {
  if (msg)
    bootbox.alert(msg, function () {
      window.location.reload();
    });
  else window.location.reload();
}

function onConnected() {
  $("#details").remove();
  Janus.log("  -- This is a publisher/manager");
  // Prepare the username registration
  $("#videojoin").removeClass("hide").show();
  $("#registernow").removeClass("hide").show();
  $("#register").click(registerUsername);
  $("#username").focus();
  $("#start")
    .removeAttr("disabled")
    .html("Stop")
    .click(function () {
      $(this).attr("disabled", true);
      videoroom.destroy();
    });
}

function checkEnter(field, event) {
  var theCode = event.keyCode
    ? event.keyCode
    : event.which
    ? event.which
    : event.charCode;
  if (theCode == 13) {
    registerUsername();
    return false;
  } else {
    return true;
  }
}

function registerUsername() {
  if ($("#username").length === 0) {
    // Create fields to register
    $("#register").click(registerUsername);
    $("#username").focus();
  } else {
    // Try a registration
    $("#username").attr("disabled", true);
    $("#register").attr("disabled", true).unbind("click");
    var username = $("#username").val();
    if (username === "") {
      $("#you")
        .removeClass()
        .addClass("label label-warning")
        .html("Insert your display name (e.g., pippo)");
      $("#username").removeAttr("disabled");
      $("#register").removeAttr("disabled").click(registerUsername);
      return;
    }
    if (/[^a-zA-Z0-9]/.test(username)) {
      $("#you")
        .removeClass()
        .addClass("label label-warning")
        .html("Input is not alphanumeric");
      $("#username").removeAttr("disabled").val("");
      $("#register").removeAttr("disabled").click(registerUsername);
      return;
    }
    var roomId = 1234;
    if ($("#room_id").val()) {
      roomId = parseInt($("#room_id").val());
    }
    var public = false;
    if ($("#public").prop("checked")) {
      public = true;
    }
    videoroom.Join(roomId, username, public);
  }
}

function findMember(id) {
  var idx = null;
  for (var i = 1; i < 12; i++) {
    if (feeds[i] != null && feeds[i] != undefined && feeds[i].id == id) {
      idx = i;
      break;
    }
  }
  return idx;
}

function onMemberEnter(member) {
  var idx = 0;
  // Subscriber created and attached
  for (var i = 1; i < 12; i++) {
    if (feeds[i] === undefined || feeds[i] === null) {
      feeds[i] = member;
      idx = i;
      break;
    }
  }
  var spinner = feeds[idx].spin;
  if (spinner === undefined || spinner === null) {
    var target = document.getElementById("videoremote" + idx);
    feeds[idx].spin = new Spinner({ top: 100 }).spin(target);
  } else {
    feeds[idx].spin.spin();
  }
  $("#remote" + idx)
    .removeClass("hide")
    .html(member.name)
    .show();
  var mi = new Media(true, true, true);
  if ($("#ckaudio" + idx).length) $("#ckaudio" + idx)[0].checked = mi.audio;
  if ($("#ckvideo" + idx).length) $("#ckvideo" + idx)[0].checked = mi.video;
  videoroom.setMemberMedia(member.id, mi);
}
function setMemberMedia(idx) {
  if (feeds[idx]) {
    var mi = new Media(true, true, true);
    mi.audio = $("#ckaudio" + idx).prop("checked");
    mi.video = $("#ckvideo" + idx).prop("checked");
    videoroom.setMemberMedia(feeds[idx].id, mi);
  } else {
    Janus.warn("no such member ", idx);
  }
}
function onMemberLeave(member) {
  var idx = findMember(member.id);
  if (idx != null) {
    Janus.debug(
      "Feed " +
        member.id +
        " (" +
        member.name +
        ") has left the room, detaching"
    );
    $("#remote" + idx)
      .empty()
      .hide();
    $("#videoremote" + idx).empty();
    onRemoveStream(member.id);
    feeds[idx] = null;
  }
}

function toggleMute() {
  var muted = videoroom.isAudioMuted();
  Janus.log((muted ? "Unmuting" : "Muting") + " local stream...");
  videoroom.setAudioMuted(!muted);
  muted = videoroom.isAudioMuted();
  $("#mute").html(muted ? "Unmute" : "Mute");
}

function publishOwnFeed(useAudio) {
  $("#publish").attr("disabled", true).unbind("click");
  if (!videoroom.Publish(useAudio))
    $("#publish")
      .removeAttr("disabled")
      .click(function () {
        publishOwnFeed(true);
      });
}

function onUnpublish() {
  $("#videolocal").html(
    '<button id="publish" class="btn btn-primary">Publish</button>'
  );
  $("#publish").click(function () {
    publishOwnFeed(true);
  });
  $("#videolocal").parent().parent().unblock();
  $("#bitrate").parent().parent().addClass("hide");
  $("#bitrate a").unbind("click");
}

function unpublishOwnFeed() {
  // Unpublish our stream
  $("#unpublish").attr("disabled", true).unbind("click");
  videoroom.UnPublish(onUnpublish);
}

function onJoinRoom(member) {
  publishOwnFeed(true);
}

function onRoomClose(id, reason) {
  bootbox.alert("The room " + id + " closed, reason " + reason, function () {
    window.location.reload();
  });
}

function onLocalStream(stream) {
  $("#videolocal").empty();
  $("#videojoin").hide();
  $("#videos").removeClass("hide").show();
  if ($("#myvideo").length === 0) {
    $("#videolocal").append(
      '<video class="rounded centered" id="myvideo" width="100%" height="100%" autoplay muted="muted"/>'
    );
    // Add a 'mute' button
    $("#videolocal").append(
      '<button class="btn btn-warning btn-xs" id="mute" style="position: absolute; bottom: 0px; left: 0px; margin: 15px;">Mute</button>'
    );
    $("#mute").click(toggleMute);
    // Add an 'unpublish' button
    $("#videolocal").append(
      '<button class="btn btn-warning btn-xs" id="unpublish" style="position: absolute; bottom: 0px; right: 0px; margin: 15px;">Unpublish</button>'
    );
    $("#unpublish").click(unpublishOwnFeed);
  }
  $("#publisher").removeClass("hide").html(videoroom.myinfo.name).show();
  Janus.attachMediaStream($("#myvideo").get(0), stream);
  $("#myvideo").get(0).muted = "muted";
  $("#videolocal")
    .parent()
    .parent()
    .block({
      message: "<b>Publishing...</b>",
      css: {
        border: "none",
        backgroundColor: "transparent",
        color: "white",
      },
    });
  var videoTracks = stream.getVideoTracks();
  if (
    videoTracks === null ||
    videoTracks === undefined ||
    videoTracks.length === 0
  ) {
    // No webcam
    $("#myvideo").hide();
    $("#videolocal").append(
      '<div class="no-video-container">' +
        '<i class="fa fa-video-camera fa-5 no-video-icon" style="height: 100%;"></i>' +
        '<span class="no-video-text" style="font-size: 16px;">No webcam available</span>' +
        "</div>"
    );
  }
}

function onWebrtcState(on) {
  $("#videolocal").parent().parent().unblock();
  // This controls allows us to override the global room bitrate cap
  showBitrateUI();
}

function showBitrateUI() {
  $("#bitrate").parent().parent().removeClass("hide").show();
  $("#bitrate a").click(function () {
    var id = $(this).attr("id");
    var bitrate = parseInt(id) * 1000;
    if (bitrate === 0) {
      Janus.log("Not limiting bandwidth via REMB");
    } else {
      Janus.log("Capping bandwidth to " + bitrate + " via REMB");
    }
    $("#bitrateset")
      .html($(this).html() + '<span class="caret"></span>')
      .parent()
      .removeClass("open");
    videoroom.Configure({ bitrate: bitrate });
    return false;
  });
  $("#public").click(function () {
    var public = $("#public").prop("checked");
    Janus.log("public " + public);
    videoroom.Configure({ public: public });
  });
}

function onRemoveStream(id) {
  var idx = findMember(id);
  if (idx == null) {
    return;
  }
  var spinner = feeds[idx].spin;
  if (spinner !== undefined && spinner !== null) {
    spinner.stop();
    feeds[idx].spin = null;
  }
  $("#waitingvideo" + idx).remove();
  $("#curbitrate" + idx).remove();
  $("#curres" + idx).remove();
  if (feeds[idx].timer !== null) {
    clearInterval(feeds[idx].timer);
    feeds[idx].timer = null;
  }
}

function onAddStream(id, stream) {
  var idx = findMember(id);
  if (idx == null) {
    return;
  }
  Janus.debug("Remote feed #" + idx);
  if ($("#remotevideo" + idx).length === 0) {
    // No remote video yet
    $("#videoremote" + idx).append(
      '<video class="rounded centered" id="waitingvideo' +
        idx +
        '" width=320 height=240 />'
    );
    $("#videoremote" + idx).append(
      '<video class="rounded centered relative hide" id="remotevideo' +
        idx +
        '" width="100%" height="100%" autoplay/>'
    );
  }
  $("#videoremote" + idx).append(
    '<span class="label label-primary hide" id="curres' +
      idx +
      '" style="position: absolute; bottom: 0px; left: 0px; margin: 15px;"></span>' +
      '<span class="label label-info hide" id="curbitrate' +
      idx +
      '" style="position: absolute; bottom: 0px; right: 0px; margin: 15px;"></span>'
  );
  // Show the video, hide the spinner and show the resolution when we get a playing event
  $("#remotevideo" + idx).bind("playing", function () {
    var spinner = feeds[idx].spin;
    if (spinner !== undefined && spinner !== null) spinner.stop();
    feeds[idx].spin = null;
    $("#waitingvideo" + idx).remove();
    $("#remotevideo" + idx).removeClass("hide");
    var width = this.videoWidth;
    var height = this.videoHeight;
    $("#curres" + idx)
      .removeClass("hide")
      .text(width + "x" + height)
      .show();
    if (adapter.browserDetails.browser === "firefox") {
      // Firefox Stable has a bug: width and height are not immediately available after a playing
      setTimeout(function () {
        var width = $("#remotevideo" + idx).get(0).videoWidth;
        var height = $("#remotevideo" + idx).get(0).videoHeight;
        $("#curres" + idx)
          .removeClass("hide")
          .text(width + "x" + height)
          .show();
      }, 2000);
    }
  });
  Janus.attachMediaStream($("#remotevideo" + idx).get(0), stream);
  var videoTracks = stream.getVideoTracks();
  if (
    videoTracks === null ||
    videoTracks === undefined ||
    videoTracks.length === 0 ||
    videoTracks[0].muted
  ) {
    // No remote video
    $("#remotevideo" + idx).hide();
    $("#videoremote" + idx).append(
      '<div class="no-video-container">' +
        '<i class="fa fa-video-camera fa-5 no-video-icon" style="height: 100%;"></i>' +
        '<span class="no-video-text" style="font-size: 16px;">No remote video available</span>' +
        "</div>"
    );
  }
  if (
    adapter.browserDetails.browser === "chrome" ||
    adapter.browserDetails.browser === "firefox"
  ) {
    $("#curbitrate" + idx)
      .removeClass("hide")
      .show();
    feeds[idx].timer = setInterval(function () {
      // Display updated bitrate, if supported
      var bitrate = videoroom.getBitrate(id);
      $("#curbitrate" + idx).text(bitrate);
    }, 1000);
  }
}

$(document).ready(function () {
  // Initialize the library (all console debuggers enabled)
  Janus.init({
    debug: "all",
    callback: function () {
      // Use a button to start the demo
      $("#start").click(function () {
        if (started) return;
        started = true;
        $(this).attr("disabled", true).unbind("click");
        // Make sure the browser supports WebRTC
        if (!Janus.isWebrtcSupported()) {
          bootbox.alert("No WebRTC support... ");
          return;
        }
        // Create session
        videoroom = new VideoRoom(server);
        videoroom.consentDialog = consentDialog;
        videoroom.webrtcState = onWebrtcState;
        videoroom.onConnected = onConnected;
        videoroom.onDisconnected = onDisconnected;
        videoroom.onError = onError;

        videoroom.onJoinRoom = onJoinRoom;
        videoroom.onRoomClose = onRoomClose;
        videoroom.onMemberEnter = onMemberEnter;
        videoroom.onMemberLeave = onMemberLeave;
        videoroom.onLocalStream = onLocalStream;
        videoroom.onAddStream = onAddStream;
        videoroom.onRemoveStream = onRemoveStream;
      });
    },
  });
});
