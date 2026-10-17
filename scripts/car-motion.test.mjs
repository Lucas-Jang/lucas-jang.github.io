import test from 'node:test';
import assert from 'node:assert/strict';
import { geometry, trackPose, contain, createFlight, stepFlight, bottomDistance, GRAVITY, ENVIRONMENTS, spring, stepDrive, boostSpeed, tangent, cornerCrossed, releaseVelocity, resizeFlight, roadPath, flightBounds } from '../public/scripts/car-dynamics.mjs';
import { BOOST_CHARGE_MS, isCarHome, chargedBoost, shouldRamp } from '../public/scripts/car-controls.mjs';
import { PORTS, projectPort, thrusterCommands } from '../public/scripts/car-thrusters.mjs';
import { stuntVelocity, cornerCrossing, mod } from '../public/scripts/car-dynamics.mjs';
import { meshFaces, MESH_PADDING } from '../public/scripts/car-mesh.mjs';
import { stepBoostDrive, cruiseSpeed } from '../public/scripts/car-dynamics.mjs';
import { blendRide, balanceJets, landingResponse, FRONT_LOAD } from '../public/scripts/car-ride.mjs';
import { projectPoint } from '../public/scripts/car-projection.mjs';

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
    assert(f.landed);assert(last>357);assert(f.impactSpeed<.8);
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

test('local kickflip stays within half a car of its moving track anchor in every section',()=>{
  let cases=0;
  for(const [width,height]of screens)for(const fps of [10,60,120])for(const speed of [58,78,100,155]){
    const g=geometry({width,height});let start=0;
    for(const length of g.lengths){for(const fraction of [.01,.5,.99]){
      const distance=start+length*fraction,p=trackPose(g,distance),v=tangent(p,speed),hop=stuntVelocity(g,p,speed,'kickflip');
      const inward=hop.x*p.nx+hop.y*p.ny;
      let f=createFlight(g,p,'kickflip',{x:v.x+p.nx*inward,y:v.y+p.ny*inward},{distance,speed});
      for(let n=0;n<fps*5&&!f.landed;n++){
        f=stepFlight(g,f,1/fps);const base=trackPose(g,f.anchorDistance);
        assert(Math.hypot(f.x-base.x,f.y-base.y)<g.size*.55,JSON.stringify({width,height,fps,distance,f}));
        assert(f.constraintError<.001);inside(g,f);
      }
      assert(f.landed,JSON.stringify({width,height,fps,distance,f}));
      const attached=trackPose(g,f.attachDistance);assert(Math.hypot(attached.x-f.x,attached.y-f.y)<.001);cases++;
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

test('resizing an attached-surface flip preserves roll and returns to the remapped surface',()=>{
  const previous=geometry({width:1280,height:720}),distance=previous.perimeter*.37,p=trackPose(previous,distance),forward=tangent(p,100),v=stuntVelocity(previous,p,100,'kickflip'),hop=v.x*p.nx+v.y*p.ny;
  const original=stepFlight(previous,createFlight(previous,p,'kickflip',{x:forward.x+p.nx*hop,y:forward.y+p.ny*hop},{distance,speed:100}),.1);
  for(const [width,height]of screens){const g=geometry({width,height});let f=resizeFlight(g,previous,original);
    assert.equal(f.roll,original.roll);assert.equal(f.elapsed,original.elapsed);
    for(let t=0;t<5&&!f.landed;t+=1/60)f=stepFlight(g,f,1/60);
    assert(f.landed);const target=trackPose(g,f.attachDistance);assert(Math.hypot(f.x-target.x,f.y-target.y)<.001);
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
        assert(f.impactSpeed <= .65); assert(maximumCorrection < .001, `hard position correction ${maximumCorrection}`); cases++;
      }
      start += length;
    }
  }
  assert.equal(cases, 960);
});

test('all 61 rotation frames have finite closed body faces and fit the padded canvas', () => {
  for (const size of [104, 136, 176]) for (let frame = 0; frame <= 60; frame++) {
    const g = { size, carHeight: size * .43 }, t = Math.min(1, frame / 60 / .96);
    const faces = meshFaces(g, { roll: 360 * t * t * (3 - 2 * t) }, { heave: -size * .034, pitch: 5 }, frame * 14);
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
      assert(f.impactSpeed < .8);
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

test('the rendered road follows broad eased corners with continuous tangents', () => {
  for (const [width, height] of screens) {
    const g = geometry({ width, height });
    assert(g.radius >= Math.min(g.size, (g.right - g.left) / 2, (g.bottom - g.top) / 2));
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
      assert(flight.impactSpeed < .8, JSON.stringify(flight));
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
      assert(different); assert(f.impactSpeed < .8);
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
    assert(f.landed); assert(f.impactSpeed < .8);
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
    assert(f.landed); assert(ignited); assert(f.impactSpeed < .8);
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
