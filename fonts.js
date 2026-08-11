const LETTERS = "AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz".split("");
let idx = 0;
const glyphData = {};
let currentStrokes = [];
let drawing = false;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const warning = document.getElementById('emptywarning');

function saveProgress(){
    localStorage.setItem('fontProgress', JSON.stringify({glyphData, idx}));
}

function setupCanvasSize(){
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
}

function drawGuide(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = "#bbb";
    ctx.font = `${canvas.height*1.22}px serif`;
    ctx.textBaseline = "alphabetic";
    const ch = LETTERS[idx];
    const metrics = ctx.measureText(ch);
    const x = (canvas.width - metrics.width)/2;
    ctx.fillText(ch, x, canvas.height*0.85);

    ctx.strokeStyle = "#222";
    ctx.lineWidth = canvas.width*0.02;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    currentStrokes.forEach(stroke=>{
        ctx.beginPath();
        stroke.forEach((p,i)=> i===0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
        ctx.stroke();
    });
}

function pos(e) {
    const r = canvas.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - r.left, 0), canvas.width);
    const y = Math.min(Math.max(e.clientY - r.top, 0), canvas.height);
    return { x, y};
}

canvas.addEventListener('pointerdown', e=>{
    e.preventDefault();
    drawing = true;
    currentStrokes.push([pos(e)]);
    canvas.setPointerCapture(e.pointerId);
    warning.style.display = 'none';
});

canvas.addEventListener('pointermove', e=> {
    if(!drawing) return;
    e.preventDefault();
    currentStrokes[currentStrokes.length-1].push(pos(e));
    drawGuide();
});
canvas.addEventListener('pointerup', ()=> drawing=false);
canvas.addEventListener('pointercancel', ()=> drawing=false);

document.getElementById('clear').onclick = ()=>{
    currentStrokes = [];
    delete glyphData[LETTERS[idx]];
    drawGuide();
};

document.getElementById('skip').onclick = ()=> nextLetter(true);
document.getElementById('confirm').onclick = ()=>{
    if(currentStrokes.length ===0){
        warning.style.display = 'block';
        return;
    }
    warning.style.display = 'none';
    nextLetter(false);
};

function nextLetter(skip){
    warning.style.display = 'none';
    if(currentStrokes.length>0){
        glyphData[LETTERS[idx]] = currentStrokes;
    }
    idx++;
    if(idx >= LETTERS.length){
        currentStrokes = [];
        finishFont();
    } else {
        currentStrokes = glyphData[LETTERS[idx]] ? glyphData[LETTERS[idx]] : [];
        drawGuide();
    }
    saveProgress();
    updateLiveFont();
};

document.getElementById('back').onclick = ()=>{
    if(idx === 0) return;
    warning.style.display = 'none';
    if(currentStrokes.length > 0){
        glyphData[LETTERS[idx]] = currentStrokes;
    }
    idx--;
    currentStrokes = glyphData[LETTERS[idx]] ? glyphData[LETTERS[idx]] : [];
    drawGuide();
    saveProgress();
    updateLiveFont();
};

document.getElementById('clearall').onclick = ()=> {
    localStorage.removeItem('fontProgress');

    Object.keys(glyphData).forEach(key => delete glyphData[key]);
    idx = 0;
    currentStrokes = [];
    drawing = false;

    drawGuide();
    updateLiveFont();
};

window.addEventListener('load', ()=>{
    setupCanvasSize();
    const saved = localStorage.getItem('fontProgress');
    if(saved){
        const data = JSON.parse(saved);
        Object.assign(glyphData, data.glyphData);
        idx = data.idx;
        currentStrokes = glyphData[LETTERS[idx]] ? glyphData[LETTERS[idx]] : [];
    }
    drawGuide();
    updateLiveFont();
});

function strokeToOutline(points, width){
    if(points.length < 2){
        if(points.length===1){
            const p = points[0], h = width/2;
            return [[{x:p.x-h,y:p.y-h},{x:p.x+h,y:p.y-h},{x:p.x+h,y:p.y+h},{x:p.x-h,y:p.y+h}]];
        }
        return [];
    }
    const half = width/2;
    const left = [], right = [];
    for(let i=0;i<points.length;i++){
        const p0 = points[Math.max(i-1,0)];
        const p1 = points[Math.min(i+1,points.length-1)];
        let dx = p1.x-p0.x, dy = p1.y-p0.y;
        const len = Math.hypot(dx,dy) || 1;
        dx/=len; dy/=len;
        const nx = -dy*half, ny = dx*half;
        left.push({x: points[i].x+nx, y: points[i].y+ny});
        right.push({x: points[i].x-nx, y: points[i].y-ny});
    }
    return [ left.concat(right.reverse()) ];
}

function finishFont(){
    document.querySelector('.drawboard').style.display = 'none';
    document.getElementById('doneBoard').style.display = 'flex';

    const unitsPerEm = 1000;
    const scale = unitsPerEm / canvas.width * 0.9;
    const baselineY = canvas.height * 0.85;

    function toFontPoint(p){
        return { x: p.x * scale, y: (baselineY - p.y) * scale };
    }

    const glyphs = [];
    glyphs.push(new opentype.Glyph({
        name: '.notdef', advanceWidth: 600, path: new opentype.Path()
    }));
    glyphs.push(new opentype.Glyph({
        name: 'space', unicode: 32, advanceWidth: 300, path: new opentype.Path()
    }));

    LETTERS.forEach(ch=>{
    const strokes = glyphData[ch];
    if(!strokes) return; // no glyph added — falls back to sans-serif for this char

    const path = new opentype.Path();
    strokes.forEach(stroke=>{
        const polys = strokeToOutline(stroke, canvas.width*0.06);
        polys.forEach(poly=>{
            poly.forEach((pt,i)=>{
                const fp = toFontPoint(pt);
                i===0 ? path.moveTo(fp.x, fp.y) : path.lineTo(fp.x, fp.y);
            });
            path.close();
        });
    });
    const bbox = path.getBoundingBox();
    const sideBearing = unitsPerEm * 0.06;
    const advanceWidth = (bbox.x2 - bbox.x1) + sideBearing * 2;

    glyphs.push(new opentype.Glyph({
        name: ch, unicode: ch.charCodeAt(0), advanceWidth, path
    }));
});

    const font = new opentype.Font({
        familyName: "MyHandwriting",
        styleName: "Regular",
        unitsPerEm, ascender: 800, descender: -200,
        glyphs
    });

    const arrayBuffer = font.toArrayBuffer();
    const blob = new Blob([arrayBuffer], {type:'font/ttf'});
    const url = URL.createObjectURL(blob);

    const fontFace = new FontFace('MyHandwriting', arrayBuffer);
    fontFace.load().then(loaded=>{
        document.fonts.add(loaded);
        document.getElementById('previewArea').style.fontFamily = "MyHandwriting, sans-serif";
    });

    document.getElementById('download').onclick = ()=>{
        const a = document.createElement('a');
        a.href = url;
        a.download = 'my-handwriting-font.ttf';
        a.click();
        localStorage.removeItem('fontProgress');
    };
}
let liveFontFace = null;

async function updateLiveFont(){
    const unitsPerEm = 1000;
    const scale = unitsPerEm / canvas.width * 0.9;
    const baselineY = canvas.height * 0.85;
    const toFontPoint = p => ({ x: p.x*scale, y: (baselineY-p.y)*scale });

    const glyphs = [
        new opentype.Glyph({name:'.notdef', advanceWidth:600, path:new opentype.Path()}),
        new opentype.Glyph({name:'space', unicode:32, advanceWidth:300, path:new opentype.Path()})
    ];

    let any = false;
    LETTERS.forEach(ch=>{
        const strokes = glyphData[ch];
        if(!strokes) return;
        any = true;
        const path = new opentype.Path();
        strokes.forEach(stroke=>{
            strokeToOutline(stroke, canvas.width*0.06).forEach(poly=>{
                poly.forEach((pt,i)=>{
                    const fp = toFontPoint(pt);
                    i===0 ? path.moveTo(fp.x,fp.y) : path.lineTo(fp.x,fp.y);
                });
                path.close();
            });
        });
        const bbox = path.getBoundingBox();
        const advanceWidth = (bbox.x2-bbox.x1) + unitsPerEm*0.16;
        glyphs.push(new opentype.Glyph({name:ch, unicode:ch.charCodeAt(0), advanceWidth, path}));
    });

    if(!any) {
        document.getElementById('livePreview').style.fontFamily = "sans-serif";
        document.getElementById('livePreviewCap').style.fontFamily = "sans-serif";

        if(liveFontFace){
            document.fonts.delete(liveFontFace);
            liveFontFace = null;
        }
        return;
    }

    const font = new opentype.Font({
        familyName: "LivePreviewFont", styleName: "Regular",
        unitsPerEm, ascender: 800, descender: -200, glyphs
    });
    const newFontFace = new FontFace('LivePreviewFont', font.toArrayBuffer());
    await newFontFace.load();

    if(liveFontFace) document.fonts.delete(liveFontFace);
    document.fonts.add(newFontFace);
    liveFontFace = newFontFace;

    document.getElementById('livePreview').style.fontFamily = "LivePreviewFont, sans-serif";
    document.getElementById('livePreviewCap').style.fontFamily = "LivePreviewFont, sans-serif";
}

document.getElementById('frontUpload').addEventListener('change', async (e)=>{
    const file = e.target.files[0];
    if(!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const fontFace = new FontFace('MyHandwriting', arrayBuffer);
    await fontFace.load();
    document.fonts.add(fontFace);

    document.querySelector('.drawboard').style.display = 'none';
    document.getElementById('doneBoard').style.display = 'flex';
    document.getElementById('previewArea').style.fontFamily = "MyHandwriting, sans-serif";

});