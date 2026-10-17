import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, trackPose, contain, createFlight, stepFlight, bottomDistance, GRAVITY, ENVIRONMENTS, spring, stepDrive, boostSpeed, tangent, cornerCrossed, releaseVelocity, resizeFlight, roadPath, flightBounds } from '../public/scripts/car-dynamics.mjs';
import { BOOST_CHARGE_MS, isCarHome, chargedBoost, shouldRamp } from '../public/scripts/car-controls.mjs';
import { PORTS, projectPort, thrusterCommands, jetVector } from '../public/scripts/car-thrusters.mjs';
import { stuntVelocity, cornerCrossing, mod } from '../public/scripts/car-dynamics.mjs';
import { meshFaces, MESH_PADDING } from '../public/scripts/car-mesh.mjs';
import { stepBoostDrive, cruiseSpeed } from '../public/scripts/car-dynamics.mjs';
import { blendRide, balanceJets, landingResponse, FRONT_LOAD } from '../public/scripts/car-ride.mjs';
import { projectPoint } from '../public/scripts/car-projection.mjs';
import { AIR_EXTENSION, HEIGHTS, suspensionStep, stepLandingSuspension, landingImpulse } from '../public/scripts/car-ride.mjs';
import { dragPose, boundedRelease } from '../public/scripts/car-dynamics.mjs';
import { plumeProfile, exhaustSurface, EXHAUST_PADDING, exhaustVisibility, stepExhaustEmitters, depthMistOpacity, particleOpacity, EXHAUST_LAYER_OPACITY } from '../public/scripts/car-exhaust.mjs';

test('floor kickflip has a substantial ballistic arc without reaching the ceiling',()=>{
  for(const fps of[10,60,120]){
    const g=geometry({width:1280,height:900}),p=trackPose(g,0),v=stuntVelocity(g,p,100,'kickflip');
    let f=createFlight(g,p,'kickflip',v,{incoming:tangent(p,100)}),top=p.y,free=0;
    for(let t=0;t<12&&!f.landed;t+=1/fps){f=stepFlight(g,f,1/fps);top=Math.min(top,f.y);
      if(!f.lit&&!f.avoiding&&f.elapsed>.15){assert(Math.abs(f.accelerationY-f.gravity)<1e-8);free++;}}
    assert(f.landed);assert(free>fps*.4);assert(p.y-top>g.size*.55&&p.y-top<g.size*1.15);
    assert(top>g.top+g.size*.5);assert(f.impactSpeed>.85&&f.impactSpeed<1.65);
  }
});

test('twice the mass needs twice the corrective force without changing gravity or trajectory',()=>{
  const g=geometry({width:1280,height:900}),s=createFlight(g,{x:600,y:700,angle:10},'drop',{x:100,y:400});
  const light=stepFlight(g,{...s,mass:1},1/120),heavy=stepFlight(g,{...s,mass:2},1/120);
  assert.equal(light.gravity,heavy.gravity);assert.equal(light.y,heavy.y);assert.equal(light.vy,heavy.vy);
  assert(Math.abs(heavy.forceY-light.forceY*2)<1e-8);assert(Math.abs(heavy.forceX-light.forceX*2)<1e-8);
  assert(plumeProfile(heavy.jets.down,g.size).rate>plumeProfile(light.jets.down,g.size).rate);
  const spin=stepFlight(g,createFlight(g,trackPose(g,0),'kickflip'),.1);
  const jets=thrusterCommands(g,spin,{},spin);assert(spin.rollThrust>0);assert(jets.some(j=>j.sources.includes('roll')));
});

test('air springs isolate contact with a slow compression, gentle rebound and exact ride-height recovery',()=>{
  const size=160;
  for(const ride of Object.values(ENVIRONMENTS))for(const height of Object.keys(HEIGHTS))for(const fps of[10,30,60,120]){
    const base=HEIGHTS[height]*size;let front={value:base,velocity:0},rear={...front};
    for(let t=0;t<.8;t+=1/fps){front=suspensionStep(front,AIR_EXTENSION*size,1/fps,ride,null,size);rear=suspensionStep(rear,AIR_EXTENSION*size,1/fps,ride,null,size);}
    assert(front.value<HEIGHTS.high*size-size*.012);assert(front.value>=-size*.1);
    const response=landingResponse({size},{impactSpeed:1.3,mass:2,touchdownAngle:-.3},ride);
    let maximum=-Infinity,minimum=Infinity,peakTime=0,maxVelocity=0;
    const first=stepLandingSuspension(front,base,1/120,ride,{...response,elapsed:1/120},'front',size);
    assert(Math.abs(first.value-front.value)<size*.004,'contact cannot kick the chassis in one frame');
    for(let n=1;n<=fps*3;n++){
      const t=n/fps,landing={...response,elapsed:t};
      front=stepLandingSuspension(front,base,1/fps,ride,landing,'front',size);rear=stepLandingSuspension(rear,base,1/fps,ride,landing,'rear',size);
      const value=(front.value+rear.value)/2;
      if(value>maximum){maximum=value;peakTime=t;}if(t>=.5&&t<1.5)minimum=Math.min(minimum,value);
      maxVelocity=Math.max(maxVelocity,Math.abs(front.velocity),Math.abs(rear.velocity));
      assert(front.value<Math.max(size*.07,base+size*.045)&&rear.value<Math.max(size*.07,base+size*.045),'no hard travel-stop clipping');
    }
    assert(maximum>base+size*.006&&maximum<base+size*.05,JSON.stringify({ride:ride.label,maximum,base}));
    assert(peakTime>=.2&&peakTime<=.65);assert(maxVelocity<size*1.1);
    assert(minimum<base-size*.001&&minimum>base-size*.008,'a small smooth rebound, not repeated bouncing');
    assert(Math.abs(front.value-base)<.05&&Math.abs(rear.value-base)<.05);
  }
});

test('exhaust force increases emission and overscan has no internal viewport crop',()=>{
  assert.equal(exhaustVisibility(0),0);assert.equal(plumeProfile(0,104).opacity,0);
  assert(exhaustVisibility(.001)<.005);assert(exhaustVisibility(1)>.98);
  for(const size of[104,160,176])for(const force of[.1,.5,1,2,5,10]){
    const a=plumeProfile(force,size),b=plumeProfile(force*2,size);assert(b.rate>a.rate&&b.radius>a.radius&&b.speed>a.speed);
  }
  for(const [width,height]of[[390,844],[1280,720],[3440,1440]]){
    const s=exhaustSurface(width,height,3);assert.equal(s.width,width+EXHAUST_PADDING*2);assert.equal(s.height,height+EXHAUST_PADDING*2);
    assert(s.width*s.height*s.dpr*s.dpr<=4000001);assert(s.padding>100);
  }
});

test('hanging wheels meet the floor before the chassis and contact rebasing is visually continuous',()=>{
  const g=geometry({width:1280,height:900}),offset=g.size*.075,heave=-g.size*.085;
  let f={...createFlight(g,{x:600,y:600,angle:0},'drop',{y:150}),wheelOffset:offset};
  for(let t=0;t<14&&!f.landed;t+=1/120)f=stepFlight(g,f,1/120);
  assert(f.landed);assert.equal(f.y,g.bottom-offset);assert(f.impactSpeed>.85&&f.impactSpeed<1.65);
  const p={x:0,y:0,z:0};
  const before=projectPoint(g,{roll:0},{heave,comShift:offset},p);
  const after=projectPoint(g,{roll:0},{heave,comShift:0},p);
  assert(Math.abs(f.y+before.y-(g.bottom+after.y))<1e-8);
  const tyreBefore=projectPoint(g,{roll:0},{heave,comShift:offset},p,false);
  const tyreAfter=projectPoint(g,{roll:0},{heave,comShift:0},p,false);
  assert(Math.abs(f.y+tyreBefore.y-(g.bottom+tyreAfter.y))<1e-8);
  const offsetForMass=-heave*.88,body=projectPoint(g,{roll:0},{heave,comShift:offsetForMass},p);
  const wheel=projectPoint(g,{roll:0},{heave,comShift:offsetForMass},p,false),rest=projectPoint(g,{roll:0},{},p);
  assert(Math.abs(.88*(body.y-rest.y)+.12*(wheel.y-rest.y))<1e-8,'extension cannot lift the combined mass centre');
});

test('kickflip takeoff has a visible outward pulse from every departure surface',()=>{
  for(const [width,height]of screens){const g=geometry({width,height});let start=0;
    for(const length of g.lengths){const distance=start+length*.5,p=trackPose(g,distance),v=stuntVelocity(g,p,100,'kickflip'),hop=v.x*p.nx+v.y*p.ny,t=tangent(p,100);
      const f=stepFlight(g,createFlight(g,p,'kickflip',{x:t.x+p.nx*hop,y:t.y+p.ny*hop},{distance,speed:100}),1/120);
      const jets=thrusterCommands(g,f,{},f);
      assert(jets.some(j=>j.power>.15&&j.dx*-p.nx+j.dy*-p.ny>.45),JSON.stringify({width,height,p,jets}));
      assert(f.frontThrust>0&&f.rearThrust>0);start+=length;
    }
  }
});

test('inverted ramp departures continue the circuit rotation through upright 360 degrees',()=>{
  for(const [width,height]of screens)for(const fps of [10,60,120])for(const angle of [90,135,179,180,181,225,270,315,359]){
    const g=geometry({width,height}),p=contain(g,{x:width*.5,y:height*.4,angle});let f=createFlight(g,p,'ramp'),last=f.angle;
    assert.equal(f.initialAngle,angle);assert.equal(f.landingAngle,360);
    for(let i=0;i<fps*14&&!f.landed;i++){
      f=stepFlight(g,f,1/fps);inside(g,f);
      if(!f.landed){assert(f.angle>=last-.01,JSON.stringify({angle,last,f}));last=f.angle;}
    }
    assert(f.landed);assert(last>357);assert(f.impactSpeed<1.65);
  }
});

test('resting side texture preserves exact original proportions without camera distortion',()=>{
  const g=geometry({width:1280,height:720}),p={roll:0};
  for(const x of[-g.size/2,0,g.size/2])for(const y of[-g.carHeight/2,0,g.carHeight/2]){
    const point=projectPoint(g,p,{}, {x,y,z:g.size*.175});
    assert(Math.abs(point.x-(g.size/2+x))<1e-8);assert(Math.abs(point.y-(g.carHeight/2+y))<1e-8);
  }
  const textures=meshFaces(g,p,{}).filter(f=>f.texture);assert.equal(textures.length,1);
  const xs=textures[0].points.map(p=>p.x),ys=textures[0].points.map(p=>p.y);
  assert(Math.abs(Math.max(...xs)-Math.min(...xs)-g.size)<1e-8);
  assert(Math.abs(Math.max(...ys)-Math.min(...ys)-g.size*332/960)<1e-8);
});

test('home arena leaves header and footer outside every drive and stunt body envelope',()=>{
  for(const [width,height]of [[320,568],[390,844],[844,390],[884,892],[1280,720],[1920,1080],[2560,1080]]){
    const top=height<=450?56:92,bottom=height<=450?height-72:height-112;
    const g=geometry({width,height:bottom-top,top,compact:width<=600||height<=450,carSize:width<=600||height<=450?112:160});
    for(let i=0;i<1000;i++)inside(g,trackPose(g,g.perimeter*i/1000));
    let d=0;for(const length of g.lengths){const p=trackPose(g,d+length*.5);let f=createFlight(g,p,'ramp',stuntVelocity(g,p,boostSpeed(g),'ramp'));
      for(let t=0;t<14&&!f.landed;t+=1/60){f=stepFlight(g,f,1/60);inside(g,f);}
      assert(f.landed);d+=length;
    }
  }
});

test('2,880 kickflips integrate gravity and land on the physical floor without track attraction',()=>{
  let cases=0;
  for(const [width,height]of screens)for(const fps of[10,60,120])for(const speed of[58,78,100,155]){
    const g=geometry({width,height});let start=0;
    for(const length of g.lengths){for(const fraction of[.01,.5,.99]){
      const p=trackPose(g,start+length*fraction),v=stuntVelocity(g,p,speed,'kickflip');
      let f=createFlight(g,p,'kickflip',v,{incoming:tangent(p,speed)}),freeFrames=0,finalFrames=0;
      for(let i=0;i<fps*14&&!f.landed;i++){
        f=stepFlight(g,f,1/fps);inside(g,f);assert(f.constraintError<.001);
        if(!f.landed){
          assert(Math.abs(f.accelerationY-(f.gravity+f.forceY/f.mass))<1e-6);
          if(!f.lit&&f.elapsed>.15&&!f.avoiding){assert(Math.abs(f.accelerationY-f.gravity)<1e-6);freeFrames++;}
          if(f.finalDrop){assert(Math.abs(f.accelerationY-f.gravity)<1e-6);finalFrames++;}
        }
      }
      assert(f.landed,JSON.stringify({width,height,speed,fps,p,f}));assert.equal(f.y,g.bottom);
      assert(f.impactSpeed>.85&&f.impactSpeed<1.65,JSON.stringify({width,height,fps,f}));cases++;
    }start+=length;}
  }
  assert.equal(cases,2880);
});

test('90 percent boost covers exactly one perimeter and lowers the peak speed',()=>{
  for(const [width,height]of screens)for(const dt of [1/120,1/30,.1]){
    const g=geometry({width,height}),profile=chargedBoost(BOOST_CHARGE_MS*.9);let s={distance:g.perimeter*.93,speed:100,boostTravel:0};
    for(let t=0;t<25&&!s.complete;t+=dt)s=stepBoostDrive(g,s,profile,dt);
    assert(s.complete);assert(Math.abs(s.boostTravel-g.perimeter)<1e-7);
    assert(boostSpeed(g)<=70/3.6*g.size/4.84);
  }
});

test('small square screens retain a real acceleration range in every mode',()=>{
  for(const size of[200,240,320])for(const ride of Object.values(ENVIRONMENTS)){
    const g=geometry({width:size,height:size}),speed=cruiseSpeed(g,ride);
    assert(boostSpeed(g)>speed);assert(stepDrive(g,{speed,distance:0},1/60,ride,.5).speed>speed);
  }
});

test('resizing a ballistic flip preserves angular progress and returns to the remapped floor',()=>{
  const previous=geometry({width:1280,height:720}),p=trackPose(previous,previous.perimeter*.37);
  const original=stepFlight(previous,createFlight(previous,p,'kickflip',stuntVelocity(previous,p,100,'kickflip')),.1);
  for(const [width,height]of screens){const g=geometry({width,height});let f=resizeFlight(g,previous,original);
    assert.equal(f.roll,original.roll);assert.equal(f.elapsed,original.elapsed);
    for(let t=0;t<14&&!f.landed;t+=1/60)f=stepFlight(g,f,1/60);
    assert(f.landed);assert.equal(f.y,g.bottom);assert(f.impactSpeed<1.65);
  }
});

test('route joins have continuous position, heading and curvature without containment jumps',()=>{
  for(const [width,height]of screens){const g=geometry({width,height});let end=0;
    for(const length of g.lengths){end+=length;
      const a=trackPose(g,end-.01),b=trackPose(g,end),c=trackPose(g,end+.01);
      const turn=(p,q)=>mod(q.angle-p.angle+180,360)-180;
      assert(Math.abs(turn(a,b)-turn(b,c))<.01);
      for(const p of[a,b,c]){const q=contain(g,p);assert(Math.hypot(q.x-p.x,q.y-p.y)<1e-6);}
    }
  }
});

test('all perimeter positions and 20,480 corner-crossing drive frames need no position correction',()=>{
  let frames=0;
  for(const [width,height]of screens){const g=geometry({width,height});
    for(let i=0;i<1000;i++){
      const p=trackPose(g,g.perimeter*i/1000),q=contain(g,p),b=flightBounds(g,p);
      assert(Math.hypot(p.x-q.x,p.y-q.y)<1e-6);
      assert(p.x>=b.left-.001&&p.x<=b.right+.001&&p.y>=b.top-.001&&p.y<=b.bottom+.001);
    }
    for(const fps of[10,30,60,120])for(const ride of Object.values(ENVIRONMENTS))for(const boosted of[false,true]){
      let end=0;for(const length of g.lengths){end+=length;
        const speed=boosted?boostSpeed(g):ride.speed;let s={speed,distance:mod(end-speed*4/fps,g.perimeter)};
        for(let i=0;i<8;i++){
          const before=trackPose(g,s.distance),next=stepDrive(g,s,1/fps,ride,boosted),after=trackPose(g,next.distance),visible=contain(g,after);
          assert(Math.hypot(after.x-visible.x,after.y-visible.y)<1e-6);
          assert(Math.hypot(after.x-before.x,after.y-before.y)<=next.travel+1e-3);
          s=next;frames++;
        }
      }
    }
  }
  assert.equal(frames,20480);
});

test('mode changes blend mechanical settings; front-heavy lift conserves total force',()=>{
  for(const from of Object.values(ENVIRONMENTS))for(const to of Object.values(ENVIRONMENTS)){
    assert.equal(blendRide(from,to,0).stiffness,from.stiffness);assert.equal(blendRide(from,to,1).stiffness,to.stiffness);
    const mid=blendRide(from,to,.5);assert(mid.stiffness>=Math.min(from.stiffness,to.stiffness)&&mid.stiffness<=Math.max(from.stiffness,to.stiffness));
  }
  const g=geometry({width:1280,height:720}),f={gravity:9.81*g.size/4.84,elapsed:.3,angularVelocity:30,vy:120,x:500,initialAngle:20};
  const front=balanceJets(g,f,100,2,1/60),rear=balanceJets(g,f,-100,2,1/60);
  assert(FRONT_LOAD>.55&&FRONT_LOAD<.6);assert(front.frontThrust>rear.frontThrust);
  assert(Math.abs(front.frontThrust+front.rearThrust-2)<1e-10);
  const ceiling=balanceJets(g,{...f,angle:180},0,1,1/60),floor=balanceJets(g,{...f,angle:0},0,1,1/60);
  assert(ceiling.frontThrust>floor.frontThrust);
  for(const angle of[0,180]){
    const pose={x:500,y:300,angle,roll:0},commands=thrusterCommands(g,pose,{heave:0,pitch:0},{jets:{down:1},frontThrust:.8,rearThrust:.2});
    const frontId=angle===0?'lift-front':'roof',rearId=angle===0?'lift-rear':'roof-rear';
    assert(commands.find(c=>c.port===frontId).power>commands.find(c=>c.port===rearId).power);
  }
  for(const ride of Object.values(ENVIRONMENTS)){
    assert.equal(landingResponse(g,{impactSpeed:0},ride).front,0);
    const soft=landingResponse(g,{impactSpeed:.2,touchdownAngle:2},ride),hard=landingResponse(g,{impactSpeed:.6,touchdownAngle:-2},ride);
    assert(hard.front>soft.front);assert(soft.frontDelay>soft.rearDelay);assert(hard.frontDelay<hard.rearDelay);
    let s={value:0,velocity:hard.front};for(let t=0;t<3;t+=1/120)s=spring(s,0,1/120,ride);
    assert(Math.abs(s.value)<.02&&Math.abs(s.velocity)<.02);
  }
});

test('every straight and curved section launches inward and lands gently at low/high FPS', () => {
  let cases = 0;
  for (const [width, height] of screens) for (const fps of [10, 60]) for (const kind of ['ramp', 'kickflip']) {
    const g = geometry({ width, height }); let start = 0;
    for (const length of g.lengths) {
      for (const fraction of [.01, .5, .99]) {
        const pose = trackPose(g, start + length * fraction), v = stuntVelocity(g, pose, boostSpeed(g), kind);
        assert(v.x * pose.nx + v.y * pose.ny > 0, 'launch must point away from its own wall');
        let f = createFlight(g, pose, kind, v), maximumCorrection = 0;
        for (let frame = 0; frame < fps * 14 && !f.landed; frame++) {
          f = stepFlight(g, f, 1 / fps); maximumCorrection = Math.max(maximumCorrection, f.constraintError);
          assert([f.x, f.y, f.vx, f.vy, f.angle, f.roll].every(Number.isFinite));
        }
        assert(f.landed, `${width}×${height}, ${fps} FPS, ${kind}, segment start ${start}`);
        assert(f.impactSpeed <= 1.65); assert(maximumCorrection < .001, `hard position correction ${maximumCorrection}`); cases++;
      }
      start += length;
    }
  }
  assert.equal(cases, 960);
});

test('all 61 rotation frames have finite closed body faces and fit the padded canvas', () => {
  for (const size of [104, 136, 176]) for (let frame = 0; frame <= 60; frame++) {
    const g = { size, carHeight: size * .43 }, t = Math.min(1, frame / 60 / .96);
    const faces = meshFaces(g, { roll: 360 * t * t * (3 - 2 * t) }, { heave: AIR_EXTENSION*size, comShift: -AIR_EXTENSION*size*.88, pitch: 5 }, frame * 14);
    assert(faces.length > 50);
    for (const face of faces) for (const p of face.points) {
      assert([p.x, p.y, p.depth].every(Number.isFinite));
      assert(p.x >= -MESH_PADDING && p.x <= size + MESH_PADDING);
      assert(p.y >= -MESH_PADDING && p.y <= g.carHeight + MESH_PADDING);
    }
  }
});

test('corner crossing returns the precise arc entry, including perimeter wrapping', () => {
  const g = geometry({ width: 1280, height: 720 }); let end = 0;
  for (let i = 0; i < 8; i++) {
    end += g.lengths[i]; if (i % 2) continue;
    const crossing = cornerCrossing(g, mod(end - 12, g.perimeter), 24);
    assert(crossing); assert(Math.abs(crossing.offset - 12) < 1e-5);
    assert(Math.abs(crossing.distance - mod(end, g.perimeter)) < 1e-5);
  }
});

const screens = [[240, 320], [320, 568], [390, 844], [844, 390], [768, 1024], [1280, 720], [2560, 1080], [3440, 1440], [500, 200], [200, 500]];

test('each approaching wall receives outward exhaust before any body contact', () => {
  const g = geometry({ width: 1280, height: 900 });
  for (const [key, velocity] of [['left', { x: -1000 }], ['right', { x: 1000 }], ['up', { y: -800 }], ['down', { y: 800 }]]) {
    let f = createFlight(g, { x: 640, y: 400, angle: 0 }, 'drop', velocity), fired = false;
    for (let i = 0; i < 120; i++) {
      f = stepFlight(g, f, 1 / 120);
      const b = flightBounds(g, f);
      if (f.jets[key] > .1) {
        const gap = key === 'left' ? f.x - b.left : key === 'right' ? b.right - f.x : key === 'up' ? f.y - b.top : b.bottom - f.y;
        assert(gap > 4, JSON.stringify({ key, gap, f })); fired = true; break;
      }
    }
    assert(fired, key);
  }
});

test('diagonal approach independently fires both relevant wall-control channels', () => {
  const g = geometry({ width: 390, height: 844 });
  for (const [x, y, velocity, a, b] of [[110, 110, { x: -500, y: -500 }, 'left', 'up'], [280, 700, { x: 500, y: 500 }, 'right', 'down']]) {
    const f = stepFlight(g, createFlight(g, { x, y, angle: 0 }, 'drop', velocity), 1 / 120);
    assert(f.jets[a] > 0 && f.jets[b] > 0, JSON.stringify(f));
    assert(f.constraintError < 1e-8);
  }
});

test('300 extreme releases remain clear of every wall without bounce or position correction', () => {
  let seed = 17;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (const [width, height] of [[240, 320], [390, 844], [844, 390], [1280, 720], [500, 200]]) {
    const g = geometry({ width, height });
    for (let i = 0; i < 60; i++) {
      const dt = [1 / 120, 1 / 30, .1][i % 3];
      let f = createFlight(g, contain(g, { x: random() * width, y: random() * height, angle: random() * 360 }), 'drop',
        { x: (random() - .5) * g.size * 16, y: (random() - .5) * g.size * 14 });
      for (let t = 0; t < 20 && !f.landed; t += dt) {
        f = stepFlight(g, f, dt); const b = flightBounds(g, f);
        assert(f.x >= b.left - 1e-7 && f.x <= b.right + 1e-7 && f.y >= b.top - 1e-7 && f.y <= b.bottom + 1e-7);
        assert(f.constraintError < 1e-7);
      }
      assert(f.landed, JSON.stringify(f));
      assert(f.impactSpeed < 1.65);
    }
  }
});

test('flush port allocation preserves exhaust direction through all walls and inverted rolls', () => {
  const g = geometry({ width: 1280, height: 900 });
  for (const angle of [0, 45, 90, 180, 270]) for (const roll of [0, 45, 90, 135, 180, 270, 360]) {
    for (const [key, dx, dy] of [['left', -1, 0], ['right', 1, 0], ['up', 0, -1], ['down', 0, 1]]) {
      const pose = { x: 600, y: 400, angle, roll }, suspension = { pitch: 8, heave: -5 };
      const commands = thrusterCommands(g, pose, suspension, { jets: { [key]: 1 }, frontThrust: .7, rearThrust: .3 });
      assert(commands.length && commands.every(c => PORTS.some(p => p.id === c.port)));
      assert(Math.abs(commands.reduce((s, c) => s + c.power * c.dx, 0) - dx) < .02);
      assert(Math.abs(commands.reduce((s, c) => s + c.power * c.dy, 0) - dy) < .02);
      for (const c of commands) {
        const origin = projectPort(g, pose, suspension, PORTS.find(p => p.id === c.port), c.side);
        assert(Math.hypot(c.x - origin.x, c.y - origin.y) < 1e-9);
      }
    }
  }
  const down = thrusterCommands(g, { x: 600, y: 400, angle: 0 }, {}, { jets: { down: 2 }, frontThrust: 1.6, rearThrust: .4 });
  assert.equal(down.find(c => c.port === 'lift-front').power, 1.6);
  assert(Math.abs(down.find(c => c.port === 'lift-rear').power - .4) < 1e-9);
});

test('the car is available only on the unfiltered home feed, including explicit ALL', () => {
  for (const path of ['/', '/#main-content', '/?utm_source=test', '/?category=ALL']) assert(isCarHome(new URL(path, 'https://lucas-jang.github.io')));
  for (const path of ['/?category=DEV', '/?category=LIFE', '/about/', '/archive/', '/search/', '/posts/test/', '/__car-qa.html']) assert(!isCarHome(new URL(path, 'https://lucas-jang.github.io')));
});

test('charge power and duration grow smoothly; only the exact full charge can arm a ramp', () => {
  let previous = chargedBoost(0);
  for (let milliseconds = 1; milliseconds < BOOST_CHARGE_MS; milliseconds++) {
    const profile = chargedBoost(milliseconds);
    assert(profile.power > previous.power && profile.duration > previous.duration);
    assert(!profile.full); assert(!shouldRamp(profile, 10, true)); previous = profile;
  }
  const full = chargedBoost(BOOST_CHARGE_MS);
  assert(full.full); assert.equal(full.power, 1);
  assert(!shouldRamp(full, .99, true)); assert(!shouldRamp(full, 1, false));
  assert(shouldRamp(full, 1, true)); assert.deepEqual(chargedBoost(10000), full);
  assert.deepEqual(chargedBoost(-100), chargedBoost(0));
});

test('partial-charge boost has lower speed and retains coast-down momentum', () => {
  const g = geometry({ width: 1280, height: 720 });
  const speeds = [0, .25, .65, 1].map(f => f * BOOST_CHARGE_MS).map(ms => {
    const profile = chargedBoost(ms); let s = { speed: 100, distance: 0 };
    for (let i = 0; i < 120; i++) s = stepDrive(g, s, 1 / 60, ENVIRONMENTS.normal, profile.power);
    const next = stepDrive(g, s, 1 / 60);
    assert(next.speed < s.speed && next.speed > 100);
    return s.speed;
  });
  assert(speeds.every((v, i) => !i || v > speeds[i - 1]));
});

test('the rendered road follows eased phone/desktop corners with continuous tangents', () => {
  for (const [width, height] of screens) {
    const g = geometry({ width, height });
    assert(g.radius >= Math.min(g.size*(Math.min(width,height)<=600?.9:1), (g.right - g.left) / 2, (g.bottom - g.top) / 2)-1e-7);
    assert((roadPath(g).match(/L/g) || []).length >= 256);
    assert(!roadPath(g).includes('NaN')); assert(roadPath(g).endsWith('Z'));
    let distance = 0;
    for (const length of g.lengths) {
      distance += length;
      const before = trackPose(g, distance - .001), after = trackPose(g, distance + .001);
      assert(Math.hypot(before.x - after.x, before.y - after.y) <= .00201);
      const angle = Math.abs(((after.angle - before.angle + 540) % 360) - 180);
      assert(angle < .01);
    }
  }
});
test('the already-deployed cached client keeps its original animation API', async () => {
  const previous = await import('../public/scripts/car-motion.mjs');
  const g = previous.geometry({ width: 390, height: 844 });
  const oldFlight = { kind: 'kickflip', start: previous.trackPose(g, 0), to: 100 };
  assert.deepEqual(previous.flightPose(g, oldFlight, 1), { ...previous.contain(g, previous.trackPose(g, 100)), roll: 0 });
});
function inside(g, pose) {
  const a = pose.angle * Math.PI / 180;
  const x = (Math.abs(Math.cos(a)) * g.size + Math.abs(Math.sin(a)) * g.carHeight) / 2;
  const y = (Math.abs(Math.sin(a)) * g.size + Math.abs(Math.cos(a)) * g.carHeight) / 2;
  const edge=g.edgeInset||12;
  const left = (g.left - g.carHeight / 2 - edge), top = (g.top - g.carHeight / 2 - edge);
  const right = g.right + g.carHeight / 2 + edge, bottom = g.bottom + g.carHeight / 2 + edge;
  if(!(pose.x-x>=left-.001&&pose.x+x<=right+.001&&pose.y-y>=top-.001&&pose.y+y<=bottom+.001))
    assert.fail(JSON.stringify({width:g.width,height:g.height,pose}));
}

test('the full rounded perimeter fits portrait, landscape, ultrawide, and zoomed viewports', () => {
  for (const [width, height] of screens) for (const safe of [{}, { top: 24, right: 10, bottom: 20, left: 10 }]) {
    const g = geometry({ width, height, left: 20, top: 14 }, safe);
    for (let i = 0; i < 1000; i++) inside(g, contain(g, trackPose(g, g.perimeter * i / 1000)));
    assert.deepEqual(trackPose(g, g.perimeter), trackPose(g, 0));
  }
});

test('gravity drops and stunts stay visible and land gently on the floor, from every wall', () => {
  for (const [width, height] of screens) {
    const g = geometry({ width, height });
    for (let i = 0; i < 24; i++) for (const kind of ['drop', 'kickflip', 'ramp']) {
      const distance = g.perimeter * i / 24;
      const start = contain(g, trackPose(g, distance));
      start.x += start.nx * 70; start.y += start.ny * 70;
      let flight = createFlight(g, start, kind);
      for (let time = 0; time < 12 && !flight.landed; time += 1 / 60) {
        flight = stepFlight(g, flight, 1 / 60);
        inside(g, flight);
      }
      assert(flight.landed, JSON.stringify({ width, height, kind, flight }));
      assert.equal(flight.roll, 0); assert.equal(flight.angle, 0);
      assert(flight.impactSpeed < 1.65, JSON.stringify(flight));
      const attached = trackPose(g, bottomDistance(g, flight.x));
      assert(Math.hypot(attached.x - flight.x, attached.y - flight.y) < 1.5);
    }
  }
});

test('ballistic release preserves horizontal inertia and exact gravity before ignition', () => {
  const g = geometry({ width: 1280, height: 900 });
  for (const dt of [1 / 120, 1 / 60, 1 / 30, .1]) {
    const start = createFlight(g, { x: 600, y: 150, angle: 0 }, 'drop', { x: 150, y: 20 });
    let f = start;
    for (let i = 0; i < Math.round(.2 / dt); i++) f = stepFlight(g, f, dt);
    assert.equal(f.thrust, 0); assert.equal(f.vx, 150);
    assert(Math.abs(f.x - start.x - 150 * .2) < 1e-6);
    assert(Math.abs(f.vy - 20 - f.gravity * .2) < 1e-6);
    assert(Math.abs(f.y - start.y - 20 * .2 - .5 * f.gravity * .2 ** 2) < 1e-6);
  }
});

test('boost reaches its reduced peak at one second and coasts down without a velocity reset', () => {
  for (const [width, height] of screens) for (const dt of [1 / 120, 1 / 60, 1 / 30, .1]) {
    const g = geometry({ width, height });
    let s = { speed: 0, distance: g.perimeter - 1 };
    for (let i = 0; i < Math.round(1 / dt); i++) s = stepDrive(g, s, dt, ENVIRONMENTS.normal, true);
    assert(Math.abs(s.speed - boostSpeed(g)) < 1e-6);
    const before = s.speed;
    s = stepDrive(g, s, dt, ENVIRONMENTS.normal, false);
    assert(Math.abs(before - s.speed - ENVIRONMENTS.normal.acceleration * dt) < 1e-6);
    assert(s.distance >= 0 && s.distance < g.perimeter);
  }
});

test('corner trigger detects every wall, wraparound, and high-speed frame crossings', () => {
  for (const [width, height] of screens) {
    const g = geometry({ width, height }); let end = 0;
    for (let i = 0; i < 8; i++) {
      end += g.lengths[i];
      if (i % 2 === 0) assert(cornerCrossed(g, (end - 3 + g.perimeter) % g.perimeter, 6));
    }
    assert(cornerCrossed(g, g.perimeter - 2, g.lengths[0] + 4));
  }
});

test('maximum boost momentum lands safely at 10–120 FPS from all four walls', () => {
  for (const [width, height] of screens) for (const dt of [1 / 120, 1 / 30, .1]) {
    const g = geometry({ width, height });
    for (let side = 0; side < 4; side++) {
      const p = trackPose(g, g.perimeter * side / 4);
      let f = createFlight(g, p, 'ramp', tangent(p, boostSpeed(g) * .8));
      let different = false;
      for (let t = 0; t < 15 && !f.landed; t += dt) {
        f = stepFlight(g, f, dt); inside(g, f);
        different ||= Math.abs(f.frontThrust - f.rearThrust) > .2;
        assert(Number.isFinite(f.angle) && Number.isFinite(f.vx));
      }
      assert(f.landed, JSON.stringify({ width, height, dt, side, f }));
      assert(different); assert(f.impactSpeed < 1.65);
    }
  }
});

test('throw velocity uses recent input and becomes zero after holding still', () => {
  const samples = [{ x: 0, y: 0, time: 0 }, { x: 200, y: 100, time: 1000 }, { x: 220, y: 110, time: 1050 }];
  assert.deepEqual(releaseVelocity(samples, 1050, 176), { x: 400, y: 200 });
  assert.deepEqual(releaseVelocity(samples, 1200, 176), { x: 0, y: 0 });
});

test('rotation and zoom preserve world momentum and active flip progress until a safe landing', () => {
  const old = geometry({ width: 1280, height: 720 });
  const flight = stepFlight(old, createFlight(old, { x: 550, y: 250, angle: 90 }, 'kickflip', { x: 200 }), .1);
  for (const [width, height] of screens) {
    const g = geometry({ width, height }); let f = resizeFlight(g, old, flight);
    assert(Math.abs(f.vx / f.scale - flight.vx / flight.scale) < 1e-9);
    assert(Math.abs(f.vy / f.scale - flight.vy / flight.scale) < 1e-9);
    assert.equal(f.elapsed, flight.elapsed); assert.equal(f.roll, flight.roll);
    inside(g, f);
    for (let t = 0; t < 12 && !f.landed; t += 1 / 60) f = stepFlight(g, f, 1 / 60);
    assert(f.landed); assert(f.impactSpeed < 1.65);
  }
});

test('release has 9.81 m/s² world-down acceleration before the landing jets ignite', () => {
  const g = geometry({ width: 1280, height: 900 });
  const initial = createFlight(g, { x: 600, y: 150, angle: 90 }, 'drop');
  const next = stepFlight(g, initial, .1);
  assert.equal(next.thrust, 0);
  assert(Math.abs(next.vy / next.scale - GRAVITY * .1) < .00001);
  assert(Math.abs((next.y - initial.y) / next.scale - .5 * GRAVITY * .1 ** 2) < .00001);
});

test('landing controller survives a thrown car and low frame rates without hard impacts', () => {
  const g = geometry({ width: 390, height: 844 });
  for (const dt of [1 / 120, 1 / 30, .1]) for (const velocity of [{ x: 500, y: 500 }, { x: -500, y: -300 }]) {
    let f = createFlight(g, { x: 180, y: 180, angle: 180 }, 'drop', velocity);
    let ignited = false;
    for (let t = 0; t < 12 && !f.landed; t += dt) { f = stepFlight(g, f, dt); ignited ||= f.thrust > f.gravity; }
    assert(f.landed); assert(ignited); assert(f.impactSpeed < 1.65);
  }
});

test('air springs absorb a landing and settle across low and high frame rates', () => {
  for (const dt of [1 / 120, 1 / 60, 1 / 30, .1]) for (const environment of Object.values(ENVIRONMENTS)) {
    let s = { value: 0, velocity: 90 };
    for (let t = 0; t < 3; t += dt) s = spring(s, -5, dt, environment);
    assert(Math.abs(s.value + 5) < .01);
    assert(Math.abs(s.velocity) < .01);
  }
});

test('phone routes recover straight walls, extend the lap and move the road outward',()=>{
  // Baselines are the previously deployed v13 home arena, including UI margins.
  const cases=[[320,568,833.323,27.516],[360,800,1348.628,26.432],[390,844,1467.931,26.272],[430,932,1681.308,26.445],[844,390,1657.210,30.992]];
  for(const[width,height,oldLap,oldEdge]of cases){
    const header=height<=450?48:64,footer=height<=450?64:104;
    const g=geometry({width,height:height-header-footer-4,top:header+2,compact:true,carSize:104});
    assert(g.perimeter>oldLap*1.07);assert(g.edgeInset+g.carHeight*.07<oldEdge-2);
    assert(g.lengths[0]>g.size*.65);assert(g.lengths[2]>g.size*.2);
    assert(g.size<=104);assert(g.radius<g.size);
    for(let i=0;i<2048;i++){
      const p=trackPose(g,g.perimeter*i/2048),b=flightBounds(g,p),c=contain(g,p);
      assert(p.x>=b.left-.001&&p.x<=b.right+.001&&p.y>=b.top-.001&&p.y<=b.bottom+.001);
      assert(Math.hypot(c.x-p.x,c.y-p.y)<1e-7);
    }
  }
});

const exhaustSum=commands=>commands.reduce((s,c)=>({x:s.x+c.dx*c.power,y:s.y+c.dy*c.power,z:s.z+c.dz*c.power}),{x:0,y:0,z:0});
function exhaustTorque(g,pose,suspension,commands){
  return commands.reduce((s,c)=>{
    const port=PORTS.find(p=>p.id===c.port),r=jetVector(pose,suspension,{x:(port.x-.5)*g.size,y:(port.y-.5)*g.carHeight,z:c.side*(g.size*.35/2+1)});
    const f={x:-c.dx*c.power,y:-c.dy*c.power,z:-c.dz*c.power};
    return{x:s.x+r.y*f.z-r.z*f.y,y:s.y+r.z*f.x-r.x*f.z,z:s.z+r.x*f.y-r.y*f.x};
  },{x:0,y:0,z:0});
}

test('3D pitch and roll couples produce the requested torque and zero hidden lift',()=>{
  const g=geometry({width:390,height:844});
  for(let angle=0;angle<360;angle+=45)for(let roll=0;roll<=360;roll+=6)for(const pitch of[-8,0,8])for(const sign of[-1,1]){
    const pose={x:200,y:300,angle,roll},s={pitch},heading=angle*Math.PI/180;
    for(const kind of['pitch','roll']){
      const f=kind==='pitch'?{torqueAcceleration:sign,torqueThrust:2}:{rollAcceleration:sign,rollThrust:2};
      const commands=thrusterCommands(g,pose,s,f),net=exhaustSum(commands),torque=exhaustTorque(g,pose,s,commands);
      assert(Math.hypot(net.x,net.y,net.z)<1e-8);
      const actual=kind==='pitch'?torque.z:torque.x*Math.cos(heading)+torque.y*Math.sin(heading);
      const desired=sign*2*g.size*(kind==='pitch'?.31:.35);
      assert(Math.abs(actual-desired)<1e-6,JSON.stringify({angle,roll,pitch,kind,actual,desired}));
      if(kind==='roll')assert.equal(commands.length,4);
    }
  }
});

test('17,568 mixed nozzle scenarios conserve force, point outward and never duplicate a valve',()=>{
  const g=geometry({width:1280,height:720}),seen=new Set();let cases=0;
  const profiles=[{jets:{down:8}},{jets:{up:7}},{jets:{left:5}},{jets:{right:5}},
    ...[-1,1].flatMap(turn=>[-1,1].map(spin=>({jets:{left:2,down:5},torqueAcceleration:turn,torqueThrust:1.5,rollAcceleration:spin,rollThrust:1.8}))),
    {jets:{up:4,right:3},torqueAcceleration:1,torqueThrust:2},
    {jets:{down:12,left:7},rollAcceleration:-1,rollThrust:3},
    {jets:{down:2},boost:2},{jets:{up:1},boost:.2}];
  for(let angle=0;angle<360;angle+=45)for(let roll=0;roll<=360;roll+=6)for(const pitch of[-8,0,8])for(const f of profiles){
    const pose={x:600,y:400,angle,roll},s={pitch,heave:-8},boost=f.boost||0;
    const commands=thrusterCommands(g,pose,s,{...f,frontThrust:3,rearThrust:2},boost),net=exhaustSum(commands),a=angle*Math.PI/180;
    assert.equal(new Set(commands.map(c=>c.key)).size,commands.length);
    const expected={x:(f.jets?.right||0)-(f.jets?.left||0)+Math.cos(a)*boost*2,y:(f.jets?.down||0)-(f.jets?.up||0)+Math.sin(a)*boost*2};
    assert(Math.hypot(net.x-expected.x,net.y-expected.y,net.z)<1e-6);
    for(const c of commands){
      const p=PORTS.find(p=>p.id===c.port),normal=jetVector(pose,s,{x:p.nx,y:p.ny,z:(p.nz||0)*c.side}),origin=projectPort(g,pose,s,p,c.side);
      assert(c.dx*normal.x+c.dy*normal.y+c.dz*normal.z>=-1e-8,'no exhaust through body');
      const restored=jetVector(pose,s,c.localDirection);
      assert(Math.hypot(restored.x-c.dx,restored.y-c.dy,restored.z-c.dz)<1e-8,'fading valves stay attached to the current 3D orientation');
      assert(Math.abs(Math.hypot(c.dx,c.dy,c.dz)-1)<1e-8);assert(c.power>0&&Number.isFinite(c.power));
      assert(Math.hypot(origin.x-c.x,origin.y-c.y)<1e-8);seen.add(c.port);
    }
    cases++;
  }
  assert.equal(cases,17568);assert.equal(seen.size,PORTS.length);
});

test('kickflip spin-up and counter-burn switch diagonal ports with depth exhaust at quarter turns',()=>{
  const g=geometry({width:1280,height:900});let f=createFlight(g,trackPose(g,0),'kickflip');
  const phases=new Set(),directions=new Map();let depth=0;
  for(let i=0;i<150;i++){
    f=stepFlight(g,f,1/120);phases.add(f.rollPhase);
    const commands=thrusterCommands(g,f,{},f),rollOnly=thrusterCommands(g,f,{}, {rollAcceleration:f.rollAcceleration,rollThrust:f.rollThrust});
    if(f.rollPhase==='spin-up'||f.rollPhase==='counter-burn')directions.set(f.rollPhase,new Set(rollOnly.map(c=>c.key)));
    if(Math.abs((f.roll%180)-90)<8)depth=Math.max(depth,commands.filter(c=>Math.abs(c.dz)>.8).length);
    const net=exhaustSum(commands);assert(Math.abs(net.y-((f.jets.down||0)-(f.jets.up||0)))<1e-6);
  }
  for(const phase of['ignition','spin-up','coast','counter-burn','settled'])assert(phases.has(phase));
  assert(depth>=4);assert([...directions.get('spin-up')].every(key=>!directions.get('counter-burn').has(key)));
  const edge=thrusterCommands(g,{x:500,y:400,angle:0,roll:90},{},{jets:{down:2},frontThrust:1.2,rearThrust:.8});
  assert(edge.every(c=>c.port.startsWith('side-')));assert.equal(edge.length,2);
});

test('all modes and eight departure sections emit force-linked air through launch, tricks, drops and contact',()=>{
  const g=geometry({width:390,height:672,top:66,compact:true,carSize:104}),phases=new Set();let cases=0;
  for(const ride of Object.values(ENVIRONMENTS))for(const kind of['kickflip','ramp','drop']){
    let start=0;for(const length of g.lengths){
      const p=trackPose(g,start+length*.5),speed=cruiseSpeed(g,ride),velocity=kind==='drop'?tangent(p,speed):stuntVelocity(g,p,speed,kind);
      let f=createFlight(g,p,kind,velocity,{incoming:tangent(p,speed)});
      for(let n=0;n<840&&!f.landed;n++){
        f=stepFlight(g,f,1/60);const commands=thrusterCommands(g,f,{pitch:0,heave:AIR_EXTENSION*g.size},f),net=exhaustSum(commands);
        assert(Math.hypot(net.x-(f.jets.right-f.jets.left),net.y-(f.jets.down-f.jets.up),net.z)<1e-6);
        assert.equal(new Set(commands.map(c=>c.key)).size,commands.length);
        if(!f.landed){assert(Math.abs(f.accelerationY-f.gravity-f.forceY/f.mass)<1e-6);phases.add(f.phase);}
        if(Math.hypot(f.jets.right-f.jets.left,f.jets.down-f.jets.up)>.05)assert(commands.length>0);
        for(const c of commands)assert(Number.isFinite(c.x+c.y+c.dx+c.dy+c.dz+c.power));
      }
      assert(f.landed);assert.equal(thrusterCommands(g,f,{},f).length,0);cases++;start+=length;
    }
  }
  assert.equal(cases,96);for(const phase of['ascent','fall','braking','touchdown'])assert(phases.has(phase));
});

test('readable exhaust exceeds the faint v15 mist while staying below the old opaque cloud',()=>{
  assert(EXHAUST_LAYER_OPACITY<=.66);
  for(const force of[.1,.5,1,2,5,10])for(const size of[96,104,160]){
    const p=plumeProfile(force,size),oldRoot=Math.sqrt(force);
    assert(p.rate>28*force**.7&&p.rate<90*force**.82*.65);
    assert(p.radius>size*(.012+.012*oldRoot)&&p.radius<size*(.025+.032*oldRoot)*.75);
    assert(p.life<1);assert(p.opacity<=.40);assert(p.growth<size*(.22+.10*oldRoot)*.7);
  }
});

test('visual valve handoffs crossfade without a brightness spike at 10–120 FPS',()=>{
  const command=(key,power)=>({key,power,port:key,side:1,localDirection:{x:0,y:1,z:0}});
  const final=[];
  for(const fps of[10,30,60,120]){
    const emitters=new Map();let output;
    for(let i=0;i<fps;i++)output=stepExhaustEmitters(emitters,[command('a',4)],1/fps);
    const before=output.reduce((s,c)=>s+c.power,0);
    for(let i=0;i<fps;i++){
      output=stepExhaustEmitters(emitters,[command('b',4)],1/fps);
      const total=output.reduce((s,c)=>s+c.power,0);
      assert(total<=before+.00001&&Math.abs(total-before)<.0011,'handoff cannot brighten; pruning an invisible valve stays below 0.0011');
      assert.equal(new Set(output.map(c=>c.key)).size,output.length);
    }
    final.push(output.reduce((s,c)=>s+c.power,0));
    for(let i=0;i<fps;i++)stepExhaustEmitters(emitters,[],1/fps);
    assert.equal(emitters.size,0,'closed valves have no persistent glow');
  }
  assert(Math.max(...final)-Math.min(...final)<1e-8);
  const emitters=new Map(),spike=stepExhaustEmitters(emitters,[command('a',1000)],1/60)[0];
  assert(spike.power<1.3,'a one-frame force spike cannot create an opaque blast');
  for(let i=0;i<120;i++)stepExhaustEmitters(emitters,[command('a',1000)],1/120);
  assert(emitters.get('a').power<=6);
});

test('depth mist has no angle threshold flash and cleared landing particles never brighten again',()=>{
  let previous=0;
  for(let i=0;i<=1000;i++){
    const v=depthMistOpacity(i/1000);assert(v>=previous&&v-previous<.001);previous=v;
    assert.equal(v,depthMistOpacity(-i/1000));
  }
  assert(depthMistOpacity(.301)-depthMistOpacity(.299)<.001);
  const p={age:.1,life:.7,opacity:.25};let last=particleOpacity(p,0,false);
  for(let i=0;i<5;i++){p.age+=1/60;const next=particleOpacity(p,1/60,true);assert(next<last);last=next;}
  p.age+=1/60;assert(particleOpacity(p,1/60,false)<last,'regrab cannot restore cleared fog');
  assert.equal(particleOpacity({age:0,life:.7,opacity:.25},0,false),0,'particles fade in at birth');
});

test('landing contact load is distributed smoothly and conserves its impulse at 10–120 FPS',()=>{
 for(const ride of Object.values(ENVIRONMENTS))for(const fps of[10,30,60,120]){
  const response=landingResponse({size:160},{impactSpeed:1.3,mass:2,touchdownAngle:-.3},ride);
  for(const axle of['front','rear']){
   let impulse=0;for(let i=0;i<fps;i++)impulse+=landingImpulse(response,axle,i/fps,(i+1)/fps);
   assert(Math.abs(impulse-response[axle])<1e-8);
   assert(landingImpulse(response,axle,0,1/120)<response[axle]*.003);
  }
 }
});

test('below-floor dragging and release stay on the tyre floor without hop, corrective jets or position snap',()=>{
 let cases=0;
 for(const[width,height]of screens){const g=geometry({width,height});
  for(const angle of[0,45,90,135,180,225,270,315])for(const x of[-500,0,width*.25,width*.5,width,width+500])for(const distance of[1,100,1000]){
   const origin=contain(g,{x:width*.5,y:g.top+g.size,angle}),p=dragPose(g,origin,{x,y:g.bottom+distance});
   assert.equal(p.angle,0);assert.equal(p.y,g.bottom);assert(p.x>=g.left+g.radius&&p.x<=g.right-g.radius);
   const v=boundedRelease(g,p,{x:100,y:2000});assert.equal(v.y,0);
   const f=createFlight(g,p,'drop',v),after=stepFlight(g,f,.1),road=trackPose(g,bottomDistance(g,f.x));
   assert(f.landed&&after.landed);assert.equal(f.impactSpeed,0);assert.equal(f.vy,0);assert.equal(after.y,g.bottom);
   assert(Math.hypot(road.x-p.x,road.y-p.y)<1e-7);assert.equal(thrusterCommands(g,f,{},f).length,0);cases++;
  }
 }
 assert.equal(cases,1440);
});

test('drag samples use constrained motion; pulling beyond a pinned floor cannot store launch energy',()=>{
 const g=geometry({width:390,height:716,top:66,compact:true,carSize:104}),origin=trackPose(g,g.lengths[0]*.5),samples=[];
 for(let n=0;n<8;n++){const p=dragPose(g,origin,{x:origin.x,y:g.bottom+n*120});samples.push({x:p.x,y:p.y,time:n*12});}
 assert.equal(releaseVelocity(samples,84,g.size).y,0);
 const p=dragPose(g,origin,{x:origin.x,y:g.bottom});
 assert(boundedRelease(g,p,{x:0,y:-100}).y<0,'a genuine inward/upward flick is still available');
 assert(!createFlight(g,p,'drop',{x:0,y:-100}).landed);
 const raw=createFlight(g,{x:origin.x,y:g.bottom+200,angle:0},'drop',{x:0,y:2000});assert(raw.landed&&raw.vy===0);
});

test('a 60px mobile footer extends both vertical road segments and preserves horizontal straights',()=>{
 for(const[width,height]of[[320,568],[390,844],[430,932]]){
  const before=geometry({width,height:height-64-104-4,top:66,compact:true,carSize:104}),after=geometry({width,height:height-64-60-4,top:66,compact:true,carSize:104});
  assert(Math.abs(after.perimeter-before.perimeter-88)<1e-6);assert(Math.abs(after.lengths[2]-before.lengths[2]-44)<1e-6);
  assert.equal(after.lengths[0],before.lengths[0]);
 }
});

test('regrabbing a previous flight cannot leak old final-drop or torque commands into a grounded release',()=>{
 const g=geometry({width:390,height:844}),old={x:180,y:g.bottom-40,angle:18,roll:345,finalDrop:true,torqueAcceleration:800,rollAcceleration:900,torqueThrust:2,rollThrust:3,forceY:-900};
 const point=dragPose(g,old,{x:190,y:g.bottom+100}),ground=createFlight(g,point,'drop',{x:0,y:1000});
 assert(ground.landed);assert.equal(thrusterCommands(g,ground,{},ground).length,0);assert.equal(ground.finalDrop,false);
 const airborne=createFlight(g,{...old,y:g.top+200},'drop',{x:0,y:0});
 assert(!airborne.landed&&!airborne.finalDrop);assert.equal(airborne.torqueThrust,0);assert.equal(airborne.rollThrust,0);
});
