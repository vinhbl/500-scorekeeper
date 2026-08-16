(function(){
  "use strict";

  var KEY = "fivehundred:game:v2";
  var KEY_V1 = "fivehundred:game:v1";

  var SUITS = [
    {key:"spades",   glyph:"\u2660", name:"Spades"},
    {key:"clubs",    glyph:"\u2663", name:"Clubs"},
    {key:"diamonds", glyph:"\u2666", name:"Diamonds"},
    {key:"hearts",   glyph:"\u2665", name:"Hearts"},
    {key:"notrump",  glyph:"NT",     name:"No trumps"}
  ];
  var LEVELS = [6,7,8,9,10];
  var BASE = {6:40,7:140,8:240,9:340,10:440};
  function bidValue(level, suitIdx){ return BASE[level] + suitIdx*20; }

  /* ---------- rules ----------
     seats      which seat counts this rule applies to (progressive disclosure)
     rescorable whether flipping it can change points on hands already played  */
  var RULES = [
    {key:"defTricks", seats:[2,3,5], rescorable:true,  label:"Defenders score 10 a trick",
     note:"Off means only the bidding side ever scores."},
    {key:"slam",      seats:[2,3,5], rescorable:true,  label:"All ten tricks pays 250 minimum",
     note:"The standard slam bonus on a bid worth less than 250."},
    {key:"misereDef", seats:[2,3,5], rescorable:true,  label:"Defenders score during a mis\u00e8re",
     note:"Most tables play that they don't."},
    {key:"defShare",  seats:[3,5],   rescorable:true,  label:"Each defender scores the whole team's tricks",
     note:"Off means each defender scores only the tricks they took."},
    {key:"winOnBid",  seats:[2,3,5], rescorable:false, label:"You must be the bidder to win",
     note:"Crossing 500 on defensive tricks doesn't end the game."},
    {key:"backDoor",  seats:[2,3,5], rescorable:false, label:"\u2212500 loses outright",
     note:"Out the back door."}
  ];

  var SEAT_NAMES = {
    2:["Us","Them"],
    3:["Player 1","Player 2","Player 3"],
    5:["Player 1","Player 2","Player 3","Player 4","Player 5"]
  };

  var DEFAULT_RULES = {
    defTricks:true, slam:true, misereDef:false,
    defShare:true, winOnBid:true, backDoor:true
  };

  function newId(p){
    return p + "_" + Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-3);
  }

  function freshState(seats){
    seats = seats || 2;
    return {
      version: 2,
      game: {id:newId("g"), startedAt:Date.now(), seats:seats},
      sides: SEAT_NAMES[seats].map(function(nm){ return {id:newId("s"), name:nm}; }),
      rules: clone(DEFAULT_RULES),
      hands: []
    };
  }

  var S = freshState(2);
  var draft = blankDraft();

  function blankDraft(){
    return {contract:null, bidder:null, partner:undefined, tricks:null, defSplit:null};
  }

  function clearContract(){
    draft.contract = null; draft.tricks = null; draft.defSplit = null;
    renderAll();
  }

  function clone(o){ return JSON.parse(JSON.stringify(o)); }
  function $(id){ return document.getElementById(id); }
  function esc(s){
    return String(s).replace(/[&<>"]/g,function(m){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m];
    });
  }

  /* ---------- persistence ---------- */
  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){}
  }

  function load(){
    var raw = null;
    try{ raw = localStorage.getItem(KEY); }catch(e){}
    if(!raw){
      try{ raw = localStorage.getItem(KEY_V1); }catch(e){}
    }
    if(!raw) return;
    var parsed;
    try{ parsed = JSON.parse(raw); }catch(e){ return; }
    if(!parsed || typeof parsed !== "object") return;
    var migrated = migrate(parsed);
    if(migrated) { S = migrated; save(); }
  }

  /* ---------- migration ---------- */
  function migrate(raw){
    var s = raw;
    if(s.version == null) s = v1_to_v2(s);
    if(!s || s.version !== 2) return null;
    return validate(s) ? s : null;
  }

  function v1_to_v2(v1){
    if(!v1 || !Array.isArray(v1.sides) || !Array.isArray(v1.hands)) return null;
    var seats = v1.sides.length;
    if(seats !== 2 && seats !== 3) return null;
    var rules = Object.assign(clone(DEFAULT_RULES), v1.rules || {});
    return {
      version: 2,
      game: {id:newId("g"), startedAt:Date.now(), seats:seats},
      sides: v1.sides.map(function(x){ return {id:newId("s"), name:(x && x.name) || "?"}; }),
      rules: rules,
      hands: v1.hands.map(function(h){
        var split = new Array(seats).fill(0);
        if(h.defSplit) for(var i=0;i<seats;i++) split[i] = h.defSplit[i] || 0;
        return {
          id: newId("h"),
          contract: h.contract,
          bidder: h.bidder,
          declaring: [h.bidder],   /* v1 had no partnerships — always correct */
          tricks: h.tricks,
          trickSplit: split,
          delta: Array.isArray(h.delta) ? h.delta.slice(0,seats) : new Array(seats).fill(0),
          scoredUnder: clone(rules)
        };
      })
    };
  }

  function validate(s){
    if(!s.game || !Array.isArray(s.sides) || !Array.isArray(s.hands)) return false;
    if([2,3,5].indexOf(s.game.seats) < 0) return false;
    if(s.sides.length !== s.game.seats) return false;
    s.rules = Object.assign(clone(DEFAULT_RULES), s.rules || {});
    for(var i=0;i<s.hands.length;i++){
      var h = s.hands[i];
      if(!h || !h.contract || typeof h.bidder !== "number") return false;
      if(!Array.isArray(h.declaring)) h.declaring = [h.bidder];
      if(!Array.isArray(h.trickSplit)) h.trickSplit = new Array(s.game.seats).fill(0);
      if(!Array.isArray(h.delta) || h.delta.length !== s.game.seats) h.delta = scoreHandWith(h, s.rules, s.game.seats);
      if(!h.scoredUnder) h.scoredUnder = clone(s.rules);
      if(!h.id) h.id = newId("h");
    }
    return true;
  }

  /* ---------- scoring ---------- */
  function scoreHandWith(h, rules, seats){
    var n = seats || S.game.seats;
    var d = new Array(n).fill(0);
    var c = h.contract;
    var decl = h.declaring && h.declaring.length ? h.declaring : [h.bidder];
    var isMis = c.type === "misere";

    var made = isMis ? (h.tricks === 0) : (h.tricks >= c.level);
    var pts;
    if(made){
      pts = c.value;
      if(!isMis && rules.slam && h.tricks === 10 && c.value < 250) pts = 250;
    } else {
      pts = -c.value;
    }
    decl.forEach(function(i){ if(i>=0 && i<n) d[i] = pts; });

    var defScoring = isMis ? rules.misereDef : rules.defTricks;
    if(defScoring){
      var defTotal = 0, i;
      for(i=0;i<n;i++){ if(decl.indexOf(i) < 0) defTotal += (h.trickSplit[i]||0); }
      for(i=0;i<n;i++){
        if(decl.indexOf(i) >= 0) continue;
        d[i] += (rules.defShare ? defTotal : (h.trickSplit[i]||0)) * 10;
      }
    }
    return d;
  }

  function scoreHand(h){ return scoreHandWith(h, S.rules, S.game.seats); }

  function totalsFrom(hands){
    var t = new Array(S.game.seats).fill(0);
    hands.forEach(function(d){ d.forEach(function(v,i){ if(i<t.length) t[i]+=v; }); });
    return t;
  }
  function totals(){ return totalsFrom(S.hands.map(function(h){ return h.delta; })); }

  function outcome(){
    var run = new Array(S.game.seats).fill(0);
    for(var i=0;i<S.hands.length;i++){
      var h = S.hands[i];
      h.delta.forEach(function(v,j){ run[j]+=v; });
      for(var s=0;s<run.length;s++){
        if(S.rules.backDoor && run[s] <= -500) return {type:"out", side:s, hand:i+1};
        var onDeclaring = (h.declaring||[h.bidder]).indexOf(s) >= 0;
        if(run[s] >= 500 && (!S.rules.winOnBid || onDeclaring)){
          return {type:"win", side:s, hand:i+1};
        }
      }
    }
    return null;
  }

  /* ---------- rule changes ---------- */
  function ruleMeta(key){
    for(var i=0;i<RULES.length;i++) if(RULES[i].key === key) return RULES[i];
    return null;
  }
  function visibleRules(){
    return RULES.filter(function(r){ return r.seats.indexOf(S.game.seats) >= 0; });
  }

  function applyRuleChange(key, val){
    var meta = ruleMeta(key);
    var next = Object.assign({}, S.rules);
    next[key] = val;

    if(!meta || !meta.rescorable || !S.hands.length){
      S.rules = next; save(); renderAll(); return;
    }

    var dry = S.hands.map(function(h){ return scoreHandWith(h, next); });
    var changed = 0;
    dry.forEach(function(d,i){
      if(d.join(",") !== S.hands[i].delta.join(",")) changed++;
    });

    if(!changed){ S.rules = next; save(); renderAll(); return; }

    var before = totals();
    var after = totalsFrom(dry);
    var lines = S.sides.map(function(sd,i){
      return '<div class="rescore-line"><span>'+esc(sd.name)+'</span>'+
             '<span><i>'+before[i]+'</i> \u2192 <b>'+after[i]+'</b></span></div>';
    }).join("");

    S.rules = next;
    save(); renderAll();

    openDialog({
      title: "Rescore played hands?",
      body: '<p>This rule change affects <b>'+changed+' hand'+(changed===1?"":"s")+'</b> already on the sheet.</p>'+
            '<div class="rescore-table">'+lines+'</div>'+
            '<p class="dim">The new rule applies to future hands either way.</p>',
      confirm: "Rescore",
      cancel: "Keep as played",
      onConfirm: function(){
        S.hands.forEach(function(h,i){
          h.delta = dry[i];
          h.scoredUnder = clone(next);
        });
        save(); renderAll();
      }
    });
  }

  function handIsStale(h){
    var u = h.scoredUnder || {};
    for(var i=0;i<RULES.length;i++){
      var r = RULES[i];
      if(!r.rescorable) continue;
      if(r.seats.indexOf(S.game.seats) < 0) continue;
      if(!!u[r.key] !== !!S.rules[r.key]) return true;
    }
    return false;
  }

  /* ---------- dialog ---------- */
  var dialogAction = null;
  function openDialog(opts){
    dialogAction = opts.onConfirm || null;
    $("dlgTitle").textContent = opts.title;
    $("dlgBody").innerHTML = opts.body;
    $("dlgOk").textContent = opts.confirm || "OK";
    $("dlgCancel").textContent = opts.cancel || "Cancel";
    $("dlgOk").className = "dlg-ok" + (opts.danger ? " danger-solid" : "");
    $("dialog").hidden = false;
    $("dlgOk").focus();
  }
  function closeDialog(run){
    $("dialog").hidden = true;
    var fn = dialogAction; dialogAction = null;
    if(run && fn) fn();
  }


  /* ---------- card rank reference ----------
     Deck composition follows seat count:
       3 players -> 33 cards, 7 is the lowest in every suit
       2 sides   -> 43 cards, red suits run to 4, black only to 5
       5 players -> 53 cards, full deck down to 2
     NOTE: some tables strike the 4 of spades and 4 of diamonds instead of both
     black fours. See product/BACKLOG.md. */
  var PAIR = {spades:"clubs", clubs:"spades", diamonds:"hearts", hearts:"diamonds"};
  var SINGULAR = {spades:"spade", clubs:"club", diamonds:"diamond", hearts:"heart"};
  var JOKER_CAP =
    '<svg class="jk" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'+
    '<circle cx="3.9" cy="8" r="2.35"/><circle cx="12" cy="5.3" r="2.35"/><circle cx="20.1" cy="8" r="2.35"/>'+
    '<path d="M12 17V7.4M12 17C9.4 15.6 6.4 12.7 4.6 9.9M12 17c2.6-1.4 5.6-4.3 7.4-7.1" '+
    'stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>'+
    '<rect x="4.4" y="16.4" width="15.2" height="4.8" rx="1.92"/></svg>';
  var QUAD =
    '<span class="quad"><span class="c-blk">\u2660</span><span class="c-red">\u2665</span>'+
    '<span class="c-blk">\u2663</span><span class="c-red">\u2666</span></span>';

  function suitByKey(k){
    for(var i=0;i<SUITS.length;i++) if(SUITS[i].key===k) return SUITS[i];
    return null;
  }
  function suitColour(k){ return (k==="hearts"||k==="diamonds") ? "c-red" : "c-blk"; }

  function deckTail(trumpKey){
    var seats = S.game.seats;
    if(seats === 3) return null;
    if(seats === 5) return "6 5 4 3 2";
    return (trumpKey==="hearts"||trumpKey==="diamonds") ? "6 5 4" : "6 5";
  }

  function rankCards(trumpKey){
    var out = [{joker:true}];
    if(trumpKey === "notrump"){
      ["A","K","Q","J","10","9","8","7"].forEach(function(r){ out.push({r:r, nt:true}); });
      return out;
    }
    var S1 = suitByKey(trumpKey), P1 = suitByKey(PAIR[trumpKey]);
    out.push({r:"J", g:S1.glyph, c:suitColour(S1.key), bower:true});
    out.push({r:"J", g:P1.glyph, c:suitColour(P1.key), bower:true});
    ["A","K","Q","10","9","8","7"].forEach(function(r){
      out.push({r:r, g:S1.glyph, c:suitColour(S1.key)});
    });
    return out;
  }

  function renderRanks(trumpKey){
    var cards = rankCards(trumpKey);
    var head = trumpKey === "notrump"
      ? "Card ranks \u00b7 no trumps"
      : "Card ranks \u00b7 " + suitByKey(trumpKey).name + " are trumps";

    var h = '<div class="ranks"><div class="rk-head">'+head+'</div><div class="cards">';
    cards.forEach(function(c){
      if(c.joker){
        h += '<div class="rcard jk-card"><div class="r sm">JKR</div><div class="s">'+JOKER_CAP+'</div></div>';
        return;
      }
      var body = c.nt ? '<div class="s">'+QUAD+'</div>'
                      : '<div class="s '+c.c+'">'+c.g+'</div>';
      h += '<div class="rcard'+(c.bower?" bower":"")+'"><div class="r">'+c.r+'</div>'+body+'</div>';
    });
    var tail = deckTail(trumpKey==="notrump" ? "hearts" : trumpKey);
    if(tail) h += '<div class="rcard tail"><div class="r">'+tail+'</div></div>';
    h += '</div>';

    h += '<div class="rk-note">' + (trumpKey === "notrump"
      ? 'No bowers \u2014 every rank counts the same in all four suits. The <b>joker</b> is the highest card.'
      : 'The <b>jack of '+suitByKey(PAIR[trumpKey]).name.toLowerCase()+'</b> counts as a '+
        SINGULAR[trumpKey]+' this hand \u2014 it is the <b>left bower</b>, third highest.'
    ) + '</div></div>';
    return h;
  }

  /* The round reference. Driven by the standing bid alone — it needs the trump
     suit and nothing else, so it costs the user no extra input to see it. */
  function renderReference(){
    var el = $("reference");
    var c = draft.contract;

    if(!c){
      el.className = "panel idle";
      el.innerHTML = '<p class="contract-line" style="margin:0">Pick a contract above.</p>'+
        '<div class="tally">The card ranks for that hand\u2019s trump suit will show here.</div>';
      return;
    }
    el.className = "panel ref";

    var isMis = c.type === "misere";
    /* mis\u00e8re is played without trumps, so it borrows the no-trump ladder */
    var trumpKey = isMis ? "notrump" : c.suit;

    var st = isMis
      ? '<span class="st c-mis">'+c.label+'</span>'
      : (c.suit === "notrump"
          ? '<span class="st c-nt">NT</span>'
          : '<span class="st '+suitColour(c.suit)+'">'+suitByKey(c.suit).glyph+'</span>');
    var lv = (!isMis) ? '<span class="lv">'+c.level+'</span>' : '';

    el.innerHTML =
      '<div class="ref-band">'+
        '<div class="contract">'+lv+st+'</div>'+
        '<div class="ref-pts">'+c.value+'<span>PTS</span></div>'+
      '</div>'+
      renderRanks(trumpKey);
  }

  /* ---------- rendering ---------- */
  function renderBoard(){
    var t = totals();
    var max = Math.max.apply(null, t.concat([0]));
    $("board").className = "board seats-" + S.game.seats;
    $("board").innerHTML = S.sides.map(function(sd,i){
      var v = t[i];
      var pct = Math.min(100, Math.abs(v)/500*100);
      var neg = v < 0;
      return '<div class="side'+(v===max && v>0 ? ' lead':'')+'">'+
        '<input class="side-name" value="'+esc(sd.name)+'" data-side="'+i+'" aria-label="Side name" maxlength="18">'+
        '<div class="side-total'+(neg?' neg':'')+'">'+v+'</div>'+
        '<div class="track"><span class="'+(neg?'neg':'')+'" style="width:'+pct+'%"></span></div>'+
        '<div class="meta"><span>'+(neg?'TO \u2212500':'TO 500')+'</span><span>'+(neg?(500+v)+' LEFT':(500-v)+' TO GO')+'</span></div>'+
      '</div>';
    }).join("");

    var o = outcome();
    $("banner").innerHTML = !o ? "" :
      o.type === "win"
        ? '<div class="banner"><span>'+esc(S.sides[o.side].name)+' wins on hand '+o.hand+'</span><span>500</span></div>'
        : '<div class="banner out"><span>'+esc(S.sides[o.side].name)+' is out the back door</span><span>\u2212500</span></div>';
  }

  /* Bidding only goes up, so once a bid stands everything worth the same or
     less is out of reach. Ranking is by point value, which is the order the
     table already shows — that lets mis\u00e8re (250) and open mis\u00e8re (500) take
     part rather than sitting outside the ladder.
     NOTE: some tables rank mis\u00e8re by its own convention rather than by points.
     See product/BACKLOG.md before treating this as settled. */
  function standingValue(){
    return draft.contract ? draft.contract.value : 0;
  }
  function outbid(value){
    return value <= standingValue();
  }

  function renderBidTable(){
    var head = '<tr><th></th>' + SUITS.map(function(s){
      return '<th class="suit s-'+s.key+'">'+s.glyph+'</th>';
    }).join("") + '</tr>';

    var rows = LEVELS.map(function(lv){
      return '<tr><td class="lvl">'+lv+'</td>' + SUITS.map(function(s,si){
        var v = bidValue(lv,si);
        var sel = draft.contract && draft.contract.type==="suit" && draft.contract.level===lv && draft.contract.suit===s.key;
        var dead = !sel && outbid(v);
        return '<td><button class="cell c-'+s.key+(dead?' dead':'')+'" aria-pressed="'+(!!sel)+'"'+
          (dead?' disabled':'')+' '+
          'data-kind="suit" data-level="'+lv+'" data-suit="'+si+'" '+
          'aria-label="'+lv+' '+s.name+', '+v+' points'+(dead?', outbid':'')+'">'+v+'</button></td>';
      }).join("") + '</tr>';
    }).join("");

    $("bidTable").innerHTML = head + rows;

    var specs = [{id:"misere",label:"Mis\u00e8re",value:250},{id:"open",label:"Open mis\u00e8re",value:500}];
    $("specials").innerHTML = specs.map(function(sp){
      var sel = draft.contract && draft.contract.type==="misere" && draft.contract.id===sp.id;
      var dead = !sel && outbid(sp.value);
      return '<button class="cell spec c-misere'+(dead?' dead':'')+'" aria-pressed="'+(!!sel)+'"'+
        (dead?' disabled':'')+' data-kind="misere" data-id="'+sp.id+'"'+
        ' aria-label="'+sp.label+', '+sp.value+' points'+(dead?', outbid':'')+'">'+
        sp.label+'<b>'+sp.value+'</b></button>';
    }).join("");

    var note = $("bidNote");
    if(note) note.textContent = draft.contract ? draft.contract.label + " stands" : "Avondale";
  }

  function declaringFromDraft(){
    if(draft.bidder == null) return [];
    if(S.game.seats !== 5) return [draft.bidder];
    if(draft.partner == null || draft.partner === -1) return [draft.bidder];
    return [draft.bidder, draft.partner];
  }

  function renderRecord(){
    var el = $("record");
    var c = draft.contract;

    if(!c){
      el.className = "panel idle";
      el.innerHTML = '<p class="contract-line" style="margin:0">Pick a contract above.</p>'+
        '<div class="tally">Tap a cell in the bid table, or a mis\u00e8re, to start the hand.</div>';
      return;
    }
    el.className = "panel";

    var isMis = c.type === "misere";
    var n = S.game.seats;
    var decl = declaringFromDraft();

    var html = '<p class="contract-line">'+c.label+'<span class="val">'+c.value+' PTS</span></p>';

    html += '<div class="field"><span class="label">Who bid it</span><div class="chips">'+
      S.sides.map(function(sd,i){
        return '<button class="chip" data-role="bidder" data-i="'+i+'" aria-pressed="'+(draft.bidder===i)+'">'+esc(sd.name)+'</button>';
      }).join("")+'</div></div>';

    /* partner picker \u2014 5-player only */
    if(n === 5 && draft.bidder != null){
      html += '<div class="field"><span class="label">Playing with</span><div class="chips">'+
        S.sides.map(function(sd,i){
          if(i === draft.bidder) return "";
          return '<button class="chip" data-role="partner" data-i="'+i+'" aria-pressed="'+(draft.partner===i)+'">'+esc(sd.name)+'</button>';
        }).join("")+
        '<button class="chip alone" data-role="partner" data-i="-1" aria-pressed="'+(draft.partner===-1)+'">Alone</button>'+
        '</div><div class="tally">Whoever held the called card \u2014 or Alone if nobody did.</div></div>';
    }

    var bidderName = draft.bidder!=null ? S.sides[draft.bidder].name : "the bidder";
    var whoLabel = decl.length > 1
      ? esc(bidderName) + " + " + esc(S.sides[decl[1]].name)
      : esc(bidderName);
    html += '<div class="field"><span class="label">Tricks won by '+whoLabel+'</span><div class="chips">'+
      Array.from({length:11},function(_,k){
        return '<button class="chip num" data-role="tricks" data-i="'+k+'" aria-pressed="'+(draft.tricks===k)+'">'+k+'</button>';
      }).join("")+'</div>';
    if(isMis) html += '<div class="tally">Mis\u00e8re is made only on zero tricks.</div>';
    html += '</div>';

    /* defender split — needed when more than one defender exists and defenders score */
    var scoringDef = isMis ? S.rules.misereDef : S.rules.defTricks;
    var defenders = [];
    S.sides.forEach(function(_,i){ if(decl.indexOf(i) < 0) defenders.push(i); });

    if(defenders.length > 1 && draft.tricks!=null && scoringDef){
      var rem = 10 - draft.tricks, used = 0;
      defenders.forEach(function(i){ used += (draft.defSplit && draft.defSplit[i])||0; });
      html += '<div class="field"><span class="label">Tricks won by each defender</span>';
      defenders.forEach(function(i){
        html += '<div class="split-row"><span class="split-name">'+esc(S.sides[i].name)+'</span><div class="chips">'+
          Array.from({length:rem+1},function(_,k){
            var on = draft.defSplit && draft.defSplit[i]===k;
            return '<button class="chip num" data-role="split" data-side="'+i+'" data-i="'+k+'" aria-pressed="'+(!!on)+'">'+k+'</button>';
          }).join("")+'</div></div>';
      });
      html += '<div class="tally'+(used!==rem?' bad':'')+'">'+used+' of '+rem+' defending tricks assigned</div></div>';
    }

    var ready = readyToScore();
    html += '<button class="submit" id="scoreBtn"'+(ready?'':' disabled')+'>Score this hand</button>';
    if(ready){
      var d = scoreHand(buildHand());
      html += '<div class="preview">'+S.sides.map(function(sd,i){
        return esc(sd.name)+' '+(d[i]>=0?'+':'')+d[i];
      }).join('&nbsp;&nbsp;\u00b7&nbsp;&nbsp;')+'</div>';
    }
    el.innerHTML = html;
  }

  function buildHand(){
    var n = S.game.seats;
    var decl = declaringFromDraft();
    var split = new Array(n).fill(0);
    var defenders = [];
    S.sides.forEach(function(_,i){ if(decl.indexOf(i) < 0) defenders.push(i); });

    if(defenders.length === 1){
      split[defenders[0]] = 10 - draft.tricks;
    } else if(draft.defSplit){
      defenders.forEach(function(i){ split[i] = draft.defSplit[i]||0; });
    }

    var h = {
      id: newId("h"),
      contract: draft.contract,
      bidder: draft.bidder,
      declaring: decl,
      tricks: draft.tricks,
      trickSplit: split,
      scoredUnder: clone(S.rules)
    };
    h.delta = scoreHand(h);
    return h;
  }

  function readyToScore(){
    if(!draft.contract || draft.bidder==null || draft.tricks==null) return false;
    if(S.game.seats === 5 && draft.partner == null) return false;
    var decl = declaringFromDraft();
    var defenders = [];
    S.sides.forEach(function(_,i){ if(decl.indexOf(i) < 0) defenders.push(i); });
    if(defenders.length <= 1) return true;
    var scoring = draft.contract.type === "misere" ? S.rules.misereDef : S.rules.defTricks;
    if(!scoring) return true;
    var rem = 10 - draft.tricks, used = 0;
    defenders.forEach(function(i){ used += (draft.defSplit && draft.defSplit[i])||0; });
    return used === rem;
  }

  function renderLog(){
    $("handCount").textContent = S.hands.length ? S.hands.length + (S.hands.length===1?" hand":" hands") : "";
    if(!S.hands.length){
      $("log").innerHTML = '<div class="empty">No hands yet. Scoring runs <b>bid value if the contract is made, minus the bid value if it goes down</b>, and defenders pick up 10 a trick.</div>';
      return;
    }
    $("log").innerHTML = S.hands.map(function(h,i){
      var made = h.contract.type==="misere" ? h.tricks===0 : h.tricks >= h.contract.level;
      var last = i === S.hands.length-1;
      var decl = h.declaring || [h.bidder];
      var who = esc(S.sides[h.bidder] ? S.sides[h.bidder].name : "?");
      if(decl.length > 1){
        var p = decl.filter(function(x){ return x !== h.bidder; })[0];
        who += ' <span class="amp">+</span> ' + esc(S.sides[p] ? S.sides[p].name : "?");
      } else if(S.game.seats === 5){
        who += ' <span class="amp">alone</span>';
      }
      return '<div class="log-row'+(handIsStale(h)?' stale':'')+'">'+
        '<div class="n">'+(i+1)+'</div>'+
        '<div class="what"><b>'+who+'</b> \u2014 '+h.contract.label+
          '<span>'+(made?"MADE":"WENT DOWN")+' \u00b7 '+h.tricks+' trick'+(h.tricks===1?'':'s')+
          (handIsStale(h)?' \u00b7 <em>earlier rules</em>':'')+'</span></div>'+
        '<div class="delta">'+h.delta.map(function(v){
          return '<i class="'+(v>0?'up':(v<0?'dn':''))+'">'+(v>0?'+':'')+v+'</i>';
        }).join("")+'</div>'+
        (last ? '<button class="undo" data-role="undo">Undo</button>' : '<div></div>')+
      '</div>';
    }).join("");
  }

  function renderRules(){
    var locked = S.hands.length > 0;
    var html = visibleRules().map(function(r){
      return '<label class="rule-item"><input type="checkbox" data-rule="'+r.key+'"'+(S.rules[r.key]?' checked':'')+'>'+
        '<div>'+r.label+'<small>'+r.note+'</small></div></label>';
    }).join("");

    html += '<div class="rule-item"><div style="flex:1">Players at the table'+
      '<small>'+(locked
        ? 'Locked while a game is in progress \u2014 start a new game to change it.'
        : 'Two sides for partnership play, three for cutthroat, five for called partners.')+'</small>'+
      '<div class="seat-toggle">'+
        [2,3,5].map(function(k){
          return '<button class="chip" data-role="seats" data-i="'+k+'" aria-pressed="'+(S.game.seats===k)+'"'+
            (locked?' disabled':'')+'>'+k+(k===2?' sides':' players')+'</button>';
        }).join("")+
      '</div></div></div>';

    html += '<button class="danger" data-role="reset">Start a new game</button>';
    $("rules").innerHTML = html;
  }

  function renderAll(){ renderBoard(); renderBidTable(); renderRecord(); renderReference(); renderLog(); renderRules(); }

  /* ---------- events ---------- */
  document.addEventListener("click", function(e){
    var b = e.target.closest && e.target.closest("button");
    if(!b) return;

    if(b.id === "dlgOk"){ closeDialog(true); return; }
    if(b.id === "dlgCancel"){ closeDialog(false); return; }

    if(b.dataset.kind === "suit"){
      var lv = +b.dataset.level, si = +b.dataset.suit, s = SUITS[si];
      var v = bidValue(lv,si);
      /* tapping the standing bid again clears it — the way back from a mis-tap,
         since everything below it is disabled */
      if(draft.contract && draft.contract.type==="suit" && draft.contract.level===lv && draft.contract.suit===s.key){
        clearContract(); return;
      }
      if(outbid(v)) return;
      draft.contract = {type:"suit", level:lv, suit:s.key, label:lv+" "+s.glyph, value:v};
      draft.tricks = null; draft.defSplit = null;
      renderBidTable(); renderRecord(); renderReference(); return;
    }
    if(b.dataset.kind === "misere"){
      var id = b.dataset.id;
      var mv = id==="open" ? 500 : 250;
      if(draft.contract && draft.contract.type==="misere" && draft.contract.id===id){
        clearContract(); return;
      }
      if(outbid(mv)) return;
      draft.contract = {type:"misere", id:id,
        label: id==="open" ? "Open mis\u00e8re" : "Mis\u00e8re",
        value: mv};
      draft.tricks = null; draft.defSplit = null;
      renderBidTable(); renderRecord(); renderReference(); return;
    }

    var role = b.dataset.role;
    if(role === "bidder"){
      draft.bidder = +b.dataset.i;
      if(draft.partner === draft.bidder) draft.partner = null;
      draft.defSplit = null; renderRecord(); return;
    }
    if(role === "partner"){
      var pi = +b.dataset.i;
      draft.partner = (draft.partner === pi) ? null : pi;
      draft.defSplit = null; renderRecord(); return;
    }
    if(role === "tricks"){ draft.tricks = +b.dataset.i; draft.defSplit = null; renderRecord(); return; }
    if(role === "split"){
      draft.defSplit = draft.defSplit || {};
      draft.defSplit[+b.dataset.side] = +b.dataset.i;
      renderRecord(); return;
    }
    if(b.id === "scoreBtn"){
      if(!readyToScore()) return;
      S.hands.push(buildHand());
      draft = blankDraft();
      save(); renderAll(); return;
    }
    if(role === "undo"){ S.hands.pop(); save(); renderAll(); return; }

    if(role === "seats"){
      if(b.disabled) return;
      var want = +b.dataset.i;
      if(want === S.game.seats) return;
      S = freshState(want);
      draft = blankDraft();
      save(); renderAll(); return;
    }

    if(role === "reset"){
      openDialog({
        title: "Start a new game?",
        body: '<p>This clears the score sheet. '+S.hands.length+' hand'+(S.hands.length===1?"":"s")+' will be lost.</p>',
        confirm: "Start new game",
        cancel: "Cancel",
        danger: true,
        onConfirm: function(){
          var seats = S.game.seats;
          var names = S.sides.map(function(x){ return x.name; });
          var rules = clone(S.rules);
          S = freshState(seats);
          S.rules = rules;
          S.sides.forEach(function(sd,i){ sd.name = names[i]; });
          draft = blankDraft();
          save(); renderAll();
        }
      });
      return;
    }
  });

  document.addEventListener("change", function(e){
    var r = e.target.dataset && e.target.dataset.rule;
    if(r) applyRuleChange(r, e.target.checked);
  });

  document.addEventListener("input", function(e){
    if(e.target.classList && e.target.classList.contains("side-name")){
      S.sides[+e.target.dataset.side].name = e.target.value;
      save(); renderRecord(); renderLog();
    }
  });

  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && $("dialog") && !$("dialog").hidden) closeDialog(false);
  });


  /* ---------- landscape carousel dots ----------
     The slides themselves are pure CSS scroll-snap; this only mirrors the
     scroll position into the indicator. Portrait has no carousel, so the
     dots stay hidden and the listener does nothing. */
  function inCarousel(){
    if(typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(orientation:landscape) and (max-height:600px) and (pointer:coarse)").matches;
  }
  function slideEls(){
    return Array.prototype.slice.call(document.querySelectorAll("main.wrap .slide"));
  }
  function buildDots(){
    var dots = $("dots");
    if(!dots) return;
    if(!inCarousel()){ dots.hidden = true; dots.innerHTML = ""; return; }
    var n = slideEls().length;
    if(dots.children.length !== n){
      dots.innerHTML = new Array(n+1).join("<b></b>");
    }
    dots.hidden = false;
    markDot();
  }
  function markDot(){
    var dots = $("dots");
    if(!dots || dots.hidden) return;
    var wrap = document.querySelector("main.wrap");
    if(!wrap) return;
    /* before first layout clientWidth is 0 \u2014 fall back to the first slide
       rather than leaving every dot unlit */
    var i = wrap.clientWidth ? Math.round(wrap.scrollLeft / wrap.clientWidth) : 0;
    var kids = dots.children;
    for(var k=0;k<kids.length;k++) kids[k].className = (k===i ? "on" : "");
  }

  var dotTick = false;
  document.addEventListener("scroll", function(e){
    if(!e.target || !e.target.classList || !e.target.classList.contains("wrap")) return;
    if(dotTick) return;
    dotTick = true;
    var raf = (typeof requestAnimationFrame === "function")
      ? requestAnimationFrame : function(f){ setTimeout(f, 16); };
    raf(function(){ dotTick = false; markDot(); });
  }, true);

  if(typeof window !== "undefined" && window.addEventListener){
    window.addEventListener("resize", buildDots);
    window.addEventListener("orientationchange", function(){ setTimeout(buildDots, 120); });
  }

  load();
  renderAll();
  buildDots();

  if("serviceWorker" in navigator){
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("./sw.js", {scope:"./"}).catch(function(){});
    });
  }

  /* test hook — harmless in the browser */
  if(typeof window !== "undefined"){
    window.__500 = {
      scoreHandWith: scoreHandWith,
      migrate: migrate,
      v1_to_v2: v1_to_v2,
      RULES: RULES,
      DEFAULT_RULES: DEFAULT_RULES,
      state: function(){ return S; },
      setState: function(x){ S = x; }
    };
  }
})();
