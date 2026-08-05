(() => {
  const M = window.SunMath;
  const G = window.ApartmentGeometry;

  function create(canvas) {
    const ctx = canvas.getContext('2d');
    const camera = { yaw: -0.62, pitch: 0.86 };
    let season = 'summer';
    let minutes = 780;

    function metrics() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width: rect.width, height: rect.height };
    }

    function projected(points, zs, m) {
      return points.map((point, index) => G.project(point, zs[index], m, camera));
    }

    function polygon(points, zs, m, fill, stroke = null, blur = null) {
      const screen = projected(points, zs, m);
      ctx.save();
      if (blur) {
        ctx.shadowBlur = blur.radius;
        ctx.shadowColor = blur.color;
      }
      ctx.beginPath();
      screen.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath();
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

    function clipApartment(m) {
      const floor = G.OUTER.map(point => G.project(point, 1, m, camera));
      ctx.beginPath();
      floor.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
      ctx.closePath();
      ctx.clip();
    }

    function glass(m) {
      G.WINDOWS.forEach(window => {
        polygon(
          [window.a, window.b, window.b, window.a],
          [18, 18, 94, 94],
          m,
          'rgba(127,205,235,.075)',
          'rgba(58,164,211,.56)'
        );
      });
    }

    function wallShadows(sun, m) {
      if (sun.altitude <= 1) return;

      const incoming = G.mul(M.planDirection(sun.azimuth), -1);
      const altitude = M.clamp(sun.altitude, 5, 75);
      const shadowLength = M.clamp((G.HEIGHT / Math.tan(M.degToRad(altitude))) * 0.7, 16, 118);

      const candidates = G.WALLS
        .filter(wall => !wall.outer)
        .map(wall => {
          const tangent = G.norm([wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]]);
          const normal = G.perp(tangent);
          const length = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]);
          const facing = Math.abs(normal[0] * incoming[0] + normal[1] * incoming[1]);
          return { wall, length, facing, score: length * facing };
        })
        .filter(item => item.length > 74 && item.facing > 0.42)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4);

      ctx.save();
      clipApartment(m);
      candidates.forEach(({ wall, facing }, index) => {
        const shift = G.mul(incoming, shadowLength * (0.86 + index * 0.035));
        polygon(
          [wall.a, wall.b, G.add(wall.b, shift), G.add(wall.a, shift)],
          [1, 1, 1, 1],
          m,
          `rgba(35,35,35,${0.024 + facing * 0.025})`,
          null,
          { radius: 2.5, color: 'rgba(25,25,25,.08)' }
        );
      });
      ctx.restore();
    }

    function drawBeamBand(window, incoming, distance, exposure, offset, widthFactor, m) {
      const tangent = G.norm(window.tangent);
      const windowLength = Math.hypot(window.b[0] - window.a[0], window.b[1] - window.a[1]);
      const origin = G.add(G.mid(window.a, window.b), G.mul(tangent, windowLength * offset));
      const start = G.add(origin, G.mul(window.inward, 8));
      const end = G.add(start, G.mul(incoming, distance * (1 - Math.abs(offset) * 0.08)));
      const startHalf = M.clamp(windowLength * widthFactor, 11, 27);
      const endHalf = startHalf * 0.48;
      const beam = [
        G.add(start, G.mul(tangent, -startHalf)),
        G.add(start, G.mul(tangent, startHalf)),
        G.add(end, G.mul(tangent, endHalf)),
        G.add(end, G.mul(tangent, -endHalf))
      ];
      const alpha = (0.045 + exposure * 0.052) * (1 - Math.abs(offset) * 0.25);

      polygon(
        beam,
        [78, 78, 3, 3],
        m,
        `rgba(250,220,150,${alpha})`,
        null,
        { radius: 10, color: 'rgba(241,187,76,.24)' }
      );
    }

    function sunRays(sun, m) {
      if (sun.altitude <= 0) return 0;

      const incoming = G.mul(M.planDirection(sun.azimuth), -1);
      const altitude = M.clamp(sun.altitude, 5, 75);
      const distance = M.clamp(118 + 250 / Math.tan(M.degToRad(altitude)), 145, 330);
      const offsets = [-0.36, -0.18, 0, 0.18, 0.36];
      let litWindows = 0;

      ctx.save();
      clipApartment(m);

      G.WINDOWS.forEach(window => {
        const exposure = incoming[0] * window.inward[0] + incoming[1] * window.inward[1];
        if (exposure <= 0.015) return;
        litWindows += 1;

        const tangent = G.norm(window.tangent);
        const windowLength = Math.hypot(window.b[0] - window.a[0], window.b[1] - window.a[1]);
        const origin = G.add(G.mid(window.a, window.b), G.mul(window.inward, 7));
        const broadEnd = G.add(origin, G.mul(incoming, distance * 0.94));
        const broadHalf = M.clamp(windowLength * 0.46, 28, 78);
        polygon(
          [
            G.add(origin, G.mul(tangent, -broadHalf)),
            G.add(origin, G.mul(tangent, broadHalf)),
            G.add(broadEnd, G.mul(tangent, broadHalf * 0.34)),
            G.add(broadEnd, G.mul(tangent, -broadHalf * 0.34))
          ],
          [82, 82, 2, 2],
          m,
          `rgba(250,222,156,${0.024 + exposure * 0.032})`,
          null,
          { radius: 15, color: 'rgba(241,187,76,.18)' }
        );

        offsets.forEach(offset => drawBeamBand(window, incoming, distance, exposure, offset, 0.15, m));
      });

      ctx.restore();
      return litWindows;
    }

    function drawBackground(sun, m) {
      const daylight = M.clamp((sun.altitude + 12) / 75, 0.22, 1);
      const gradient = ctx.createLinearGradient(0, 0, 0, m.height);
      gradient.addColorStop(0, `rgba(255,255,255,${0.85 + daylight * 0.15})`);
      const shade = 220 - Math.round((1 - daylight) * 14);
      gradient.addColorStop(1, `rgb(${shade},${shade},${shade - 2})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, m.width, m.height);
    }

    function drawGroundShadow(m) {
      const shadow = G.OUTER.map(point => G.project(point, 0, m, camera));
      ctx.save();
      ctx.filter = 'blur(20px)';
      ctx.fillStyle = 'rgba(0,0,0,.075)';
      ctx.beginPath();
      shadow.forEach((point, index) => index ? ctx.lineTo(point.x + 14, point.y + 17) : ctx.moveTo(point.x + 14, point.y + 17));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    function render() {
      const m = metrics();
      ctx.clearRect(0, 0, m.width, m.height);

      const sun = M.solarPosition(M.dateForSeason(season), minutes);
      drawBackground(sun, m);
      drawGroundShadow(m);

      polygon(
        G.OUTER,
        new Array(G.OUTER.length).fill(0),
        m,
        'rgba(255,255,255,.28)',
        'rgba(150,150,150,.2)'
      );

      wallShadows(sun, m);

      const wallFaces = [];
      G.WALLS.forEach(wall => wallFaces.push(...G.faces(wall, camera)));
      wallFaces
        .sort((a, b) => a.depth - b.depth)
        .forEach(face => polygon(face.points, face.zs, m, face.fill, face.stroke));

      glass(m);
      const litWindows = sunRays(sun, m);

      polygon(
        G.OUTER,
        new Array(G.OUTER.length).fill(G.HEIGHT),
        m,
        'rgba(255,255,255,.018)',
        'rgba(210,210,210,.07)'
      );

      return { sun, litWindows };
    }

    return {
      camera,
      render,
      setSeason: value => { season = value; },
      setMinutes: value => { minutes = value; },
      reset: () => { camera.yaw = -0.62; camera.pitch = 0.86; },
      getSun: () => M.solarPosition(M.dateForSeason(season), minutes)
    };
  }

  window.SunScene = { create };
})();
