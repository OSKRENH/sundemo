(() => {
  const M = window.SunMath;
  const G = window.ApartmentGeometry;

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    const camera = { yaw: -0.62, pitch: 0.86 };
    let season = 'summer';
    let minutes = 780;

    const metrics = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width: rect.width, height: rect.height };
    };

    function projected(points, zs, m) {
      return points.map((point, index) => G.project(point, zs[index], m, camera));
    }

    function path(points) {
      ctx.beginPath();
      points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
    }

    function polygon(points, zs, m, fill, stroke = null, blur = null) {
      const screenPoints = projected(points, zs, m);
      ctx.save();
      if (blur) {
        ctx.shadowBlur = blur.radius;
        ctx.shadowColor = blur.color;
      }
      path(screenPoints);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();
    }

    function clipToFloor(m, callback) {
      const floor = G.OUTER.map(point => G.project(point, 0, m, camera));
      ctx.save();
      path(floor);
      ctx.clip();
      callback();
      ctx.restore();
    }

    function drawGlass(m) {
      G.WINDOWS.forEach(windowSegment => {
        polygon(
          [windowSegment.a, windowSegment.b, windowSegment.b, windowSegment.a],
          [18, 18, 94, 94],
          m,
          'rgba(127,205,235,.08)',
          'rgba(58,164,211,.58)'
        );
      });
    }

    function drawSunRays(sun, m) {
      if (sun.altitude <= 0) return 0;

      const incoming = G.mul(M.planDirection(sun.azimuth), -1);
      const altitude = M.clamp(sun.altitude, 4, 78);
      const rayLength = M.clamp(92 + 280 / Math.tan(M.degToRad(altitude)), 125, 370);
      let litWindows = 0;

      G.WINDOWS.forEach(windowSegment => {
        const exposure = incoming[0] * windowSegment.inward[0] + incoming[1] * windowSegment.inward[1];
        if (exposure <= 0.04) return;

        litWindows += 1;
        const startA = G.add(windowSegment.a, G.mul(windowSegment.inward, 10));
        const startB = G.add(windowSegment.b, G.mul(windowSegment.inward, 10));
        const endA = G.add(startA, G.mul(incoming, rayLength));
        const endB = G.add(startB, G.mul(incoming, rayLength));
        const worldRay = [startA, startB, endB, endA];
        const screenRay = projected(worldRay, [3, 3, 3, 3], m);
        const start = G.project(G.mid(startA, startB), 3, m, camera);
        const end = G.project(G.mid(endA, endB), 3, m, camera);
        const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
        const alpha = M.clamp(0.16 + exposure * 0.18, 0.18, 0.34);
        gradient.addColorStop(0, `rgba(255,231,176,${alpha})`);
        gradient.addColorStop(0.55, `rgba(250,218,145,${alpha * 0.62})`);
        gradient.addColorStop(1, 'rgba(250,218,145,0)');

        ctx.save();
        path(screenRay);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,236,194,${0.12 + exposure * 0.12})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });

      return litWindows;
    }

    function drawWallShadows(sun, m) {
      if (sun.altitude <= 0) return;

      const incoming = G.mul(M.planDirection(sun.azimuth), -1);
      const altitude = M.clamp(sun.altitude, 4, 78);
      const shadowLength = M.clamp(G.HEIGHT / Math.tan(M.degToRad(altitude)), 24, 240);
      const shadowOffset = G.mul(incoming, shadowLength);

      G.WALLS.forEach(wall => {
        const tangent = G.norm([wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]]);
        const widthFactor = Math.abs(tangent[0] * incoming[1] - tangent[1] * incoming[0]);
        if (widthFactor < 0.06) return;

        const shadow = [
          wall.a,
          wall.b,
          G.add(wall.b, shadowOffset),
          G.add(wall.a, shadowOffset)
        ];
        const alpha = (wall.outer ? 0.11 : 0.085) + widthFactor * (wall.outer ? 0.13 : 0.11);

        polygon(
          shadow,
          [1, 1, 1, 1],
          m,
          `rgba(35,35,39,${alpha})`,
          null,
          { radius: 5, color: 'rgba(30,30,34,.18)' }
        );
      });
    }

    function render() {
      const m = metrics();
      ctx.clearRect(0, 0, m.width, m.height);

      const sun = M.solarPosition(M.dateForSeason(season), minutes);
      const daylight = M.clamp((sun.altitude + 12) / 75, 0.2, 1);
      const background = ctx.createLinearGradient(0, 0, 0, m.height);
      background.addColorStop(0, `rgba(255,255,255,${0.82 + daylight * 0.18})`);
      const shade = 218 - Math.round((1 - daylight) * 18);
      background.addColorStop(1, `rgb(${shade},${shade},${shade - 2})`);
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, m.width, m.height);

      const outsideShadow = G.OUTER.map(point => G.project(point, 0, m, camera));
      ctx.save();
      ctx.filter = 'blur(22px)';
      ctx.fillStyle = 'rgba(0,0,0,.10)';
      path(outsideShadow.map(point => ({ x: point.x + 18, y: point.y + 20 })));
      ctx.fill();
      ctx.restore();

      polygon(
        G.OUTER,
        new Array(G.OUTER.length).fill(0),
        m,
        'rgba(255,255,255,.27)',
        'rgba(150,150,150,.22)'
      );

      let litWindows = 0;
      clipToFloor(m, () => {
        litWindows = drawSunRays(sun, m);
        drawWallShadows(sun, m);
      });

      const wallFaces = [];
      G.WALLS.forEach(wall => wallFaces.push(...G.faces(wall, camera)));
      wallFaces.sort((a, b) => a.depth - b.depth);
      wallFaces.forEach(face => polygon(face.points, face.zs, m, face.fill, face.stroke));

      drawGlass(m);

      polygon(
        G.OUTER,
        new Array(G.OUTER.length).fill(G.HEIGHT),
        m,
        'rgba(255,255,255,.035)',
        'rgba(210,210,210,.08)'
      );

      return { sun, litWindows };
    }

    return {
      camera,
      render,
      setSeason: value => { season = value; },
      setMinutes: value => { minutes = value; },
      reset: () => {
        camera.yaw = -0.62;
        camera.pitch = 0.86;
      },
      getSun: () => M.solarPosition(M.dateForSeason(season), minutes)
    };
  }

  window.SunScene = { create };
})();
