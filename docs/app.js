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
    {key:"misereNoDef", seats:[2,3,5], rescorable:true,
     label:"Defenders do not score during a mis\u00e8re",
     note:"How most tables play it. Off means defenders keep their tricks."},
    {key:"defIndividual", seats:[3,5], rescorable:true,
     label:"Defenders score individually",
     note:"Each defender scores only the tricks they took. Off means every defender scores the whole team's."},
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
    defTricks:true, slam:true, misereNoDef:true,
    /* Off by default: the documented rule in every source is that each defender
       scores only the tricks they personally took. Tables that pool defensive
       tricks turn this on. */
    defIndividual:true, winOnBid:true, backDoor:true
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
    return {contract:null, bidder:null, partner:undefined, tricks:null, defSplit:null, scored:false};
  }

  function clearContract(){
    draft.contract = null; draft.tricks = null; draft.defSplit = null;
    renderAll();
  }

  /* The likeliest outcome is that the contract was made exactly, so the count
     starts there and only needs touching when it wasn't. Mis\u00e8re starts at zero,
     which is its equivalent of "made it". */
  /* Picking a bid mid-auction is a change of mind, so the bidder survives it.
     Picking one after a hand has been scored starts a new hand, so it must not. */
  function startHand(){
    if(draft.scored) draft = blankDraft();
  }

  function seedTricks(c){
    return c.type === "misere" ? 0 : c.level;
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

  /* misereDef ("defenders score") became misereNoDef ("they do not"), so every
     rule now defaults to on, and defShare became defIndividual the same way.
     Flip any stored value, including the frozen copy
     on each hand \u2014 otherwise a rescore would use the wrong sense. */
  function migrateMisere(r){
    if(!r) return r;
    if(typeof r.misereNoDef === "undefined" && typeof r.misereDef !== "undefined"){
      r.misereNoDef = !r.misereDef;
    }
    delete r.misereDef;
    if(typeof r.defIndividual === "undefined" && typeof r.defShare !== "undefined"){
      r.defIndividual = !r.defShare;
    }
    delete r.defShare;
    return r;
  }

  function validate(s){
    if(!s.game || !Array.isArray(s.sides) || !Array.isArray(s.hands)) return false;
    if([2,3,5].indexOf(s.game.seats) < 0) return false;
    if(s.sides.length !== s.game.seats) return false;
    s.rules = Object.assign(clone(DEFAULT_RULES), migrateMisere(s.rules) || {});
    for(var i=0;i<s.hands.length;i++){
      var h = s.hands[i];
      if(!h || !h.contract || typeof h.bidder !== "number") return false;
      if(!Array.isArray(h.declaring)) h.declaring = [h.bidder];
      if(!Array.isArray(h.trickSplit)) h.trickSplit = new Array(s.game.seats).fill(0);
      if(!Array.isArray(h.delta) || h.delta.length !== s.game.seats) h.delta = scoreHandWith(h, s.rules, s.game.seats);
      if(!h.scoredUnder) h.scoredUnder = clone(s.rules); else migrateMisere(h.scoredUnder);
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

    var defScoring = isMis ? !rules.misereNoDef : rules.defTricks;
    if(defScoring){
      var defTotal = 0, i;
      for(i=0;i<n;i++){ if(decl.indexOf(i) < 0) defTotal += (h.trickSplit[i]||0); }
      for(i=0;i<n;i++){
        if(decl.indexOf(i) >= 0) continue;
        d[i] += (rules.defIndividual ? (h.trickSplit[i]||0) : defTotal) * 10;
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

  function suitByKey(k){
    for(var i=0;i<SUITS.length;i++) if(SUITS[i].key===k) return SUITS[i];
    return null;
  }
  function suitColour(k){ return (k==="hearts"||k==="diamonds") ? "c-red" : "c-blk"; }

  /* ---------- what is actually in the deck ----------
     Every rank the trump suit holds, high to low, jacks excluded (they are the
     bowers). The ladder shows all of them now rather than summarising the low
     cards in a tail. */
  function suitRanks(seats, suitKey){
    if(seats === 3) return ["A","K","Q","10","9","8","7"];
    if(seats === 5) return ["A","K","Q","10","9","8","7","6","5","4","3","2"];
    /* 43-card deck: red suits keep their fours, black suits stop at five */
    return (suitKey === "hearts" || suitKey === "diamonds")
      ? ["A","K","Q","10","9","8","7","6","5","4"]
      : ["A","K","Q","10","9","8","7","6","5"];
  }

  /* No-trumps has no single floor: at four players a 4 exists only in the red
     suits. Each rank therefore carries the suits that actually hold it. */
  var ALL_SUITS = ["spades","hearts","clubs","diamonds"];
  var RED_SUITS = ["hearts","diamonds"];
  function ntRanks(seats){
    function all(list){ return list.map(function(r){ return {r:r, suits:ALL_SUITS}; }); }
    if(seats === 3) return all(["A","K","Q","J","10","9","8","7"]);
    if(seats === 5) return all(["A","K","Q","J","10","9","8","7","6","5","4","3","2"]);
    return all(["A","K","Q","J","10","9","8","7","6","5"])
      .concat([{r:"4", suits:RED_SUITS}]);
  }

  function rankCards(trumpKey){
    var seats = S.game.seats;
    var out = [{joker:true}];
    if(trumpKey === "notrump"){
      ntRanks(seats).forEach(function(x){ out.push({r:x.r, suits:x.suits}); });
      return out;
    }
    var S1 = suitByKey(trumpKey), P1 = suitByKey(PAIR[trumpKey]);
    out.push({r:"J", g:S1.glyph, c:suitColour(S1.key), bower:true});
    out.push({r:"J", g:P1.glyph, c:suitColour(P1.key), bower:true});
    suitRanks(seats, trumpKey).forEach(function(r){
      out.push({r:r, g:S1.glyph, c:suitColour(S1.key)});
    });
    return out;
  }

  /* The ladder may wrap to two rows, never three. If a deck ever grew long
     enough to need a third, the overflow collapses back into a tail chip.
     Nothing in the app reaches that today \u2014 the longest ladder is fifteen
     chips at five players, and two rows hold eighteen. */
  var PER_ROW_PORTRAIT = 9, PER_ROW_LANDSCAPE = 10;
  function fitLadder(cards, perRow){
    if(!perRow || cards.length <= perRow * 2) return {cards:cards, tail:null};
    var keep = perRow * 2 - 1;
    var rest = cards.slice(keep).map(function(c){ return c.joker ? "JKR" : c.r; });
    return {cards:cards.slice(0, keep), tail:rest.join(" ")};
  }

  function pipCluster(suits){
    return '<span class="quad">'+
      suits.map(function(k){
        return '<span class="'+suitColour(k)+'">'+suitByKey(k).glyph+'</span>';
      }).join("")+'</span>';
  }

  function rankNote(trumpKey){
    if(trumpKey === "notrump"){
      return 'Every rank counts the same in all four suits. The <b>joker</b> is the highest card.';
    }
    return 'The <b>joker</b> and the <b>jack of '+suitByKey(PAIR[trumpKey]).name.toLowerCase()+
           '</b> are considered as <b>'+suitByKey(trumpKey).name.toLowerCase()+'</b> this hand.';
  }

  function renderRanks(trumpKey){
    var fit = fitLadder(rankCards(trumpKey),
                        inCarousel() ? PER_ROW_LANDSCAPE : PER_ROW_PORTRAIT);
    var head = trumpKey === "notrump"
      ? "Card ranks \u00b7 no trumps"
      : "Card ranks \u00b7 " + suitByKey(trumpKey).name + " are trumps";

    /* Two groups, not one block: the ladder hugs the top of the card and the
       note hugs the bottom, with the slack pooling between them. */
    var h = '<div class="ranks"><div class="rk-top">'+
            '<div class="rk-head">'+head+'</div><div class="cards">';
    fit.cards.forEach(function(c){
      if(c.joker){
        h += '<div class="rcard jk-card"><div class="r sm">JKR</div><div class="s">'+JOKER_CAP+'</div></div>';
        return;
      }
      var body = c.suits ? '<div class="s">'+pipCluster(c.suits)+'</div>'
                         : '<div class="s '+c.c+'">'+c.g+'</div>';
      h += '<div class="rcard'+(c.bower?" bower":"")+'"><div class="r">'+c.r+'</div>'+body+'</div>';
    });
    if(fit.tail) h += '<div class="rcard tail"><div class="r">'+fit.tail+'</div></div>';
    h += '</div></div>';

    h += '<div class="rk-bottom"><div class="rk-note">'+rankNote(trumpKey)+'</div></div></div>';
    return h;
  }

  /* Before any bid exists the reference still has to show something, so it
     falls back to the lowest contract rather than an empty state. */
  var DEFAULT_CONTRACT = {type:"suit", level:6, suit:"spades", label:"6 \u2660", value:40};

  function referenceHTML(){
    var c = draft.contract || DEFAULT_CONTRACT;
    var isMis = c.type === "misere";
    /* mis\u00e8re is played without trumps, so it borrows the no-trump ladder */
    var trumpKey = isMis ? "notrump" : c.suit;

    var st = isMis
      ? '<span class="st c-mis">'+c.label+'</span>'
      : (c.suit === "notrump"
          ? '<span class="st c-nt">NT</span>'
          : '<span class="st '+suitColour(c.suit)+'">'+suitByKey(c.suit).glyph+'</span>');
    var lv = (!isMis) ? '<span class="lv">'+c.level+'</span>' : '';

    return '<div class="ref-band">'+
        '<div class="contract">'+lv+st+'</div>'+
        '<div class="ref-pts">'+c.value+'<span>PTS</span></div>'+
      '</div>'+
      renderRanks(trumpKey);
  }

  /* Two mount points, one source: the pager page carries it in portrait, the
     standalone slide in landscape. CSS decides which is visible. */
  function renderReference(){
    var html = referenceHTML();
    ["reference","referencePage"].forEach(function(id){
      var el = $(id);
      if(!el) return;
      el.className = "panel ref";
      el.innerHTML = html;
    });
  }

  /* ---------- bid table / ranks pager dots ---------- */
  function buildBidDots(){
    var dots = $("bidDots"), pager = $("bidPager");
    if(!dots || !pager || !dots.children || !pager.children) return;
    if(dots.children.length !== pager.children.length){
      dots.innerHTML = new Array(pager.children.length + 1).join("<b></b>");
    }
    markBidDot();
  }
  function markBidDot(){
    var dots = $("bidDots"), pager = $("bidPager");
    if(!dots || !pager || !dots.children) return;
    var i = pager.clientWidth ? Math.round(pager.scrollLeft / pager.clientWidth) : 0;
    for(var k=0;k<dots.children.length;k++){
      dots.children[k].className = (k === i ? "on" : "");
    }
  }

  /* ---------- scoring feedback ----------
     After a hand lands, bring the board back into view and let the totals count
     to their new value, so the change is something you watch rather than
     something you have to go looking for. */
  var SCROLL_MS = 900, PAUSE_MS = 250, COUNT_MS = 1100;

  function reducedMotion(){
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function easeInOutCubic(t){ return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; }
  function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

  function tween(dur, ease, onStep, onDone){
    var t0 = null;
    function frame(now){
      if(t0 === null) t0 = now;
      var p = dur <= 0 ? 1 : Math.min(1, (now - t0) / dur);
      onStep(ease(p));
      if(p < 1) requestAnimationFrame(frame);
      else if(onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  function paintBoard(vals){
    var sides = document.querySelectorAll("#board .side");
    for(var i=0;i<sides.length && i<vals.length;i++){
      var v = Math.round(vals[i]);
      var tot = sides[i].querySelector(".side-total");
      var bar = sides[i].querySelector(".track span");
      var go  = sides[i].querySelector(".togo");
      if(tot){ tot.textContent = v; tot.className = "side-total" + (v<0 ? " neg" : ""); }
      if(bar){ bar.style.width = (Math.round(Math.min(100, Math.max(0, v)/500*100) * 10) / 10) + "%"; }
      if(go){ go.textContent = (500 - v) + " TO GO"; }
    }
  }

  function celebrateScore(from, to){
    var board = $("board");
    if(!board) return;

    var top = 0;
    try { top = window.pageYOffset || document.documentElement.scrollTop || 0; } catch(e){}

    /* the count begins when the scroll ENDS, not after a guessed delay, so the
       board is always settled before a number moves */
    function startCount(){
      setTimeout(function(){
        tween(COUNT_MS, easeOutCubic, function(e){
          paintBoard(to.map(function(v,i){ return from[i] + (v - from[i]) * e; }));
        }, function(){ paintBoard(to); });
      }, PAUSE_MS);
    }

    if(reducedMotion() || typeof requestAnimationFrame !== "function"){
      if(!inCarousel()){ try { window.scrollTo(0,0); } catch(e){} }
      paintBoard(to);
      return;
    }

    paintBoard(from);

    /* already at the top, or paging the carousel \u2014 nothing to scroll */
    if(inCarousel() || top <= 0){ startCount(); return; }

    tween(SCROLL_MS, easeInOutCubic, function(e){
      try { window.scrollTo(0, Math.round(top * (1 - e))); } catch(err){}
    }, startCount);
  }


  /* A row of chips fills the width when it fits on one line, and keeps its
     natural widths once it wraps \u2014 stretching a wrapped row would leave the
     last row's chips comically wide. CSS alone cannot tell the two apart, so
     measure after render. */
  function fitChipRows(){
    var rows = document.querySelectorAll("#record .chips");
    for(var i=0;i<rows.length;i++){
      var kids = rows[i].children, single = true;
      if(kids.length > 1 && typeof kids[0].offsetTop === "number"){
        var top = kids[0].offsetTop;
        for(var k=1;k<kids.length;k++){
          if(kids[k].offsetTop !== top){ single = false; break; }
        }
      }
      if(rows[i].classList) rows[i].classList.toggle("fill", single);
    }
  }

  /* ---------- disclosure chips ----------
     A grid row that animates from 0fr to 1fr, so the page lengthens and
     shortens rather than snapping. */
  function toggleDisclosure(btn){
    var panel = $(btn.dataset.target);
    if(!panel) return;
    var open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    panel.classList.toggle("open", !open);
  }

  /* ---------- rendering ---------- */
  function renderBoard(){
    var t = totals();
    var max = Math.max.apply(null, t.concat([0]));
    $("board").className = "board seats-" + S.game.seats;
    $("board").innerHTML = S.sides.map(function(sd,i){
      var v = t[i];
      var neg = v < 0;
      /* The bar measures progress toward winning, so a negative score is simply
         no progress \u2014 it empties rather than filling the other way. The target
         is always 500; going negative just makes it further off. */
      var pct = Math.round(Math.min(100, Math.max(0, v)/500*100) * 10) / 10;
      return '<div class="side'+(v===max && v>0 ? ' lead':'')+'">'+
        '<input class="side-name" value="'+esc(sd.name)+'" data-side="'+i+'" aria-label="Side name" maxlength="18">'+
        '<div class="side-total'+(neg?' neg':'')+'">'+v+'</div>'+
        '<div class="track"><span style="width:'+pct+'%"></span></div>'+
        '<div class="meta"><span>TO 500</span><span class="togo">'+(500-v)+' TO GO</span></div>'+
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
  /* The single source for "is there a bid on the table right now". Once a hand
     is scored its auction is over, so nothing stands \u2014 the recorded hand is
     still in the record panel, but it must not block the next bid. Both the
     render and the tap handler read this, so they cannot disagree. */
  function standingContract(){
    return draft.scored ? null : draft.contract;
  }
  function standingValue(){
    var c = standingContract();
    return c ? c.value : 0;
  }
  function outbid(value){
    return value <= standingValue();
  }

  function renderBidTable(){
    var standing = standingContract();
    var head = '<tr><th></th>' + SUITS.map(function(s){
      return '<th class="suit s-'+s.key+'">'+s.glyph+'</th>';
    }).join("") + '</tr>';

    var rows = LEVELS.map(function(lv){
      return '<tr><td class="lvl">'+lv+'</td>' + SUITS.map(function(s,si){
        var v = bidValue(lv,si);
        var sel = standing && standing.type==="suit" && standing.level===lv && standing.suit===s.key;
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
      var sel = standing && standing.type==="misere" && standing.id===sp.id;
      var dead = !sel && outbid(sp.value);
      return '<button class="cell spec c-misere'+(dead?' dead':'')+'" aria-pressed="'+(!!sel)+'"'+
        (dead?' disabled':'')+' data-kind="misere" data-id="'+sp.id+'"'+
        ' aria-label="'+sp.label+', '+sp.value+' points'+(dead?', outbid':'')+'">'+
        sp.label+'<b>'+sp.value+'</b></button>';
    }).join("");


  }

  /* True once the bidder's side is settled. Until then "defender" has no
     meaning \u2014 declaringFromDraft() returns an empty array, which would make
     every side look like a defender. */
  function declaringKnown(){
    if(draft.bidder == null) return false;
    if(S.game.seats === 5 && draft.partner == null) return false;
    return true;
  }

  function declaringFromDraft(){
    if(draft.bidder == null) return [];
    if(S.game.seats !== 5) return [draft.bidder];
    if(draft.partner == null || draft.partner === -1) return [draft.bidder];
    return [draft.bidder, draft.partner];
  }

  function renderRecord(){
    var el = $("record");
    var locked = !!draft.scored;
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

    /* Two named columns. In portrait they are display:contents and change
       nothing; in landscape they become the left and right halves. */
    html += '<div class="rec-col rec-who">';

    html += '<div class="field"><span class="label">Who bid it</span><div class="chips">'+
      S.sides.map(function(sd,i){
        return '<button class="chip" data-role="bidder" data-i="'+i+'" aria-pressed="'+(draft.bidder===i)+'"'+(locked?' disabled':'')+'>'+esc(sd.name)+'</button>';
      }).join("")+'</div></div>';

    /* Partner picker \u2014 five players only, and always visible. Hiding it until a
       bidder was chosen made the panel jump and hid half the question. */
    if(n === 5){
      html += '<div class="field"><span class="label">Playing with</span><div class="chips">'+
        S.sides.map(function(sd,i){
          if(draft.bidder != null && i === draft.bidder) return "";
          return '<button class="chip" data-role="partner" data-i="'+i+'" aria-pressed="'+(draft.partner===i)+'"'+(locked?' disabled':'')+'>'+esc(sd.name)+'</button>';
        }).join("")+
        '<button class="chip alone" data-role="partner" data-i="-1" aria-pressed="'+(draft.partner===-1)+'"'+(locked?' disabled':'')+'>Alone</button>'+
        '</div><div class="tally">Whoever held the called card \u2014 or Alone if nobody did.</div></div>';
    }

    html += '</div><div class="rec-col rec-num">';

    var bidderName = draft.bidder!=null ? S.sides[draft.bidder].name : "the bidder";
    var whoLabel = decl.length > 1
      ? esc(bidderName) + " + " + esc(S.sides[decl[1]].name)
      : esc(bidderName);
    html += '<div class="field"><span class="label">Tricks won</span>'+
      stepperRow(whoLabel, draft.tricks, "tricks", null, 0, 10, false, locked);
    if(isMis) html += '<div class="tally">Mis\u00e8re is made only on zero tricks.</div>';
    html += '</div>';

    /* defender split — needed when more than one defender exists and defenders score */
    var scoringDef = isMis ? !S.rules.misereNoDef : S.rules.defTricks;
    var defenders = [];
    S.sides.forEach(function(_,i){ if(decl.indexOf(i) < 0) defenders.push(i); });

    if(declaringKnown() && defenders.length > 1 && draft.tricks!=null && scoringDef){
      var rem = 10 - draft.tricks, used = 0;
      defenders.forEach(function(i){ used += (draft.defSplit && draft.defSplit[i])||0; });
      html += '<div class="field"><span class="label">Defender tricks</span>'+
        '<div class="remain'+(used===rem?' done':'')+'"><b>'+(rem-used)+'</b> of '+rem+' left to assign</div>';
      defenders.forEach(function(i){
        html += stepperRow(esc(S.sides[i].name), (draft.defSplit && draft.defSplit[i]) || 0,
                           "split", i, 0, rem, used >= rem, locked);
      });
      html += '</div>';
    }

    var ready = readyToScore();
    html += draft.scored
      ? '<button class="submit undo-hand" id="undoBtn">Undo this hand</button>'
      : '<button class="submit" id="scoreBtn"'+(ready?'':' disabled')+'>Score this hand</button>';
    if(ready){
      var d = scoreHand(buildHand());
      html += '<div class="preview">'+S.sides.map(function(sd,i){
        return esc(sd.name)+' '+(d[i]>=0?'+':'')+d[i];
      }).join('&nbsp;&nbsp;\u00b7&nbsp;&nbsp;')+'</div>';
    }
    html += '</div>';
    el.innerHTML = html;
    fitChipRows();
  }

  /* name on the left, minus / value / plus on the right \u2014 one row per number,
     so the control is the same shape whether there are two players or five */
  function stepperRow(name, value, role, side, min, max, plusOff, locked){
    var sideAttr = side==null ? "" : ' data-side="'+side+'"';
    if(locked){
      return '<div class="srow"><span class="srow-name">'+name+'</span>'+
        '<span class="stepper"><span class="step-val">'+value+'</span></span></div>';
    }
    return '<div class="srow">'+
      '<span class="srow-name">'+name+'</span>'+
      '<span class="stepper">'+
        '<button class="step" data-role="'+role+'-dec"'+sideAttr+
          (value<=min?' disabled':'')+' aria-label="one fewer">\u2212</button>'+
        '<span class="step-val">'+value+'</span>'+
        '<button class="step" data-role="'+role+'-inc"'+sideAttr+
          ((value>=max||plusOff)?' disabled':'')+' aria-label="one more">+</button>'+
      '</span></div>';
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
    if(!draft.contract || draft.tricks==null) return false;
    if(!declaringKnown()) return false;
    var decl = declaringFromDraft();
    var defenders = [];
    S.sides.forEach(function(_,i){ if(decl.indexOf(i) < 0) defenders.push(i); });
    if(defenders.length <= 1) return true;
    var scoring = draft.contract.type === "misere" ? !S.rules.misereNoDef : S.rules.defTricks;
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

  /* The table is described in players, not sides \u2014 "2 sides" meant four people
     at the table, which nobody says out loud. Internally seats stays 2/3/5. */
  var PLAYER_COUNT = {2:4, 3:3, 5:5};
  function playerLabel(seats){ return PLAYER_COUNT[seats] + "-player"; }

  function rulesAreDefault(){
    return RULES.every(function(r){ return S.rules[r.key] === DEFAULT_RULES[r.key]; });
  }

  function setSeats(want){
    var rules = clone(S.rules);
    S = freshState(want);
    S.rules = Object.assign(clone(S.rules), rules);
    draft = blankDraft();
    save(); renderAll();
  }

  function renderPlayers(){
    var html = '<p class="disclosure-note">'+
      "Three cutthroat, four in fixed partnerships, or five with a called partner." +
      (S.hands.length ? " Changing this starts a new game." : "") + '</p>'+
      '<div class="seat-toggle">'+
        [3,2,5].map(function(k){
          return '<button class="chip" data-role="seats" data-i="'+k+'" aria-pressed="'+(S.game.seats===k)+'">'+
            playerLabel(k)+'</button>';
        }).join("")+
      '</div>';
    $("players").innerHTML = html;

    var sub = $("playersSub");
    if(sub) sub.textContent = playerLabel(S.game.seats) + " mode";
  }

  function renderRules(){
    $("rules").innerHTML = visibleRules().map(function(r){
      return '<label class="rule-item"><input type="checkbox" data-rule="'+r.key+'"'+(S.rules[r.key]?' checked':'')+'>'+
        '<div>'+r.label+'<small>'+r.note+'</small></div></label>';
    }).join("");

    var sub = $("rulesSub");
    if(sub) sub.textContent = rulesAreDefault() ? "Default" : "Custom";

    var ng = $("newGameSub");
    if(ng) ng.textContent = S.hands.length ? "Game in progress" : "";
  }


  function renderAll(){ renderBoard(); renderBidTable(); renderRecord(); renderReference(); renderLog(); renderPlayers(); renderRules(); }

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
      startHand();
      draft.contract = {type:"suit", level:lv, suit:s.key, label:lv+" "+s.glyph, value:v};
      draft.tricks = seedTricks(draft.contract); draft.defSplit = null; draft.scored = false;
      renderBidTable(); renderRecord(); renderReference(); return;
    }
    if(b.dataset.kind === "misere"){
      var id = b.dataset.id;
      var mv = id==="open" ? 500 : 250;
      var stdM = standingContract();
      if(stdM && stdM.type==="misere" && stdM.id===id){
        clearContract(); return;
      }
      if(outbid(mv)) return;
      startHand();
      draft.contract = {type:"misere", id:id,
        label: id==="open" ? "Open mis\u00e8re" : "Mis\u00e8re",
        value: mv};
      draft.tricks = seedTricks(draft.contract); draft.defSplit = null; draft.scored = false;
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
    if(role === "tricks-inc" || role === "tricks-dec"){
      var step = role === "tricks-inc" ? 1 : -1;
      draft.tricks = Math.max(0, Math.min(10, (draft.tricks||0) + step));
      draft.defSplit = null;
      renderRecord(); return;
    }
    if(role === "split-inc" || role === "split-dec"){
      var si = +b.dataset.side;
      draft.defSplit = draft.defSplit || {};
      var cur = draft.defSplit[si] || 0;
      if(role === "split-inc"){
        var decl2 = declaringFromDraft(), left = 10 - draft.tricks;
        S.sides.forEach(function(_,j){ if(decl2.indexOf(j) < 0 && j !== si) left -= (draft.defSplit[j]||0); });
        if(cur < left) draft.defSplit[si] = cur + 1;
      } else {
        draft.defSplit[si] = Math.max(0, cur - 1);
      }
      renderRecord(); return;
    }
    if(b.id === "scoreBtn"){
      if(!readyToScore()) return;
      var before = totals();
      S.hands.push(buildHand());
      /* the hand stays on screen so it can be undone at a glance; it is
         replaced the moment the next bid is picked */
      draft.scored = true;
      save(); renderAll();
      celebrateScore(before, totals());
      return;
    }
    if(role === "disclose"){ toggleDisclosure(b); return; }
    if(b.id === "undoBtn"){
      if(!S.hands.length) return;
      var was = totals();
      S.hands.pop();
      draft.scored = false;
      save(); renderAll();
      celebrateScore(was, totals());
      return;
    }
    if(role === "undo"){ S.hands.pop(); save(); renderAll(); return; }

    if(role === "seats"){
      if(b.disabled) return;
      var want = +b.dataset.i;
      if(want === S.game.seats) return;
      /* Changing the table size restarts the game \u2014 hands scored for two sides
         mean nothing at five \u2014 so ask first if anything is on the sheet. */
      if(S.hands.length){
        openDialog({
          title: "Start a new game?",
          body: '<p>Changing to '+playerLabel(want)+' clears the score sheet. '+
                S.hands.length+' hand'+(S.hands.length===1?"":"s")+' will be lost.</p>',
          confirm: "Start new game",
          cancel: "Cancel",
          danger: true,
          onConfirm: function(){ setSeats(want); }
        });
        return;
      }
      setSeats(want);
      return;
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
  /* Only sections marked `land` page in landscape \u2014 the class in the markup is
     the single source of truth, so the dot count can never drift from the CSS. */
  function slideEls(){
    return Array.prototype.slice.call(document.querySelectorAll("main.wrap .slide.land"));
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
    /* the carousel pages vertically \u2014 the dot rail runs down the right edge.
       Before first layout clientHeight is 0; fall back to the first slide
       rather than leaving every dot unlit. */
    var i = wrap.clientHeight ? Math.round(wrap.scrollTop / wrap.clientHeight) : 0;
    var kids = dots.children;
    for(var k=0;k<kids.length;k++) kids[k].className = (k===i ? "on" : "");
  }

  var dotTick = false;
  document.addEventListener("scroll", function(e){
    if(e.target && e.target.id === "bidPager"){ markBidDot(); return; }
    if(!e.target || !e.target.classList || !e.target.classList.contains("wrap")) return;
    if(dotTick) return;
    dotTick = true;
    var raf = (typeof requestAnimationFrame === "function")
      ? requestAnimationFrame : function(f){ setTimeout(f, 16); };
    raf(function(){ dotTick = false; markDot(); });
  }, true);

  if(typeof window !== "undefined" && window.addEventListener){
    window.addEventListener("resize", buildDots);
    window.addEventListener("resize", markBidDot);
    window.addEventListener("orientationchange", function(){ setTimeout(buildDots, 120); });
  }

  load();
  renderAll();
  buildDots();
  buildBidDots();

  if("serviceWorker" in navigator){
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("./sw.js", {scope:"./"}).catch(function(){});
    });
  }

  /* test hook — harmless in the browser */
  if(typeof window !== "undefined"){
    window.__500 = {
      scoreHandWith: scoreHandWith,
      fitLadder: fitLadder,
      fitChipRows: fitChipRows,
      rankCards: function(t){ return rankCards(t); },
      migrate: migrate,
      v1_to_v2: v1_to_v2,
      RULES: RULES,
      DEFAULT_RULES: DEFAULT_RULES,
      state: function(){ return S; },
      setState: function(x){ S = x; }
    };
  }
})();
