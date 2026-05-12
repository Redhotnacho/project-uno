const unused_var = "ManzDev";
let url = "https://manz.dev/";

url = "esto no se puede hacer";

console.log(url);
console.log(unused_var);

class ImageSlider extends HTMLElement {
  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
    this._images = [];
    this._current = 0; // zero-based
    this._timer = null;
    this._interval = 3000;
  }

  static get observedAttributes() {
    return ["value", "interval"];
  }

  attributeChangedCallback(name, oldV, newV) {
    if (name === "value") {
      const n = parseInt(newV, 10);
      if (!isNaN(n)) this.showIndex(n - 1);
    }
    if (name === "interval") {
      const n = parseInt(newV, 10);
      if (!isNaN(n)) {
        this._interval = n;
        this._restartTimer();
      }
    }
  }

  connectedCallback() {
    this._collectImages();
    const startAttr = parseInt(this.getAttribute("value") || "1", 10);
    this._current = isNaN(startAttr) ? 0 : Math.max(0, startAttr - 1);

    // If images are not yet parsed into the light DOM, wait for them.
    if (this._images.length === 0) {
      const tryCollectAndRender = () => {
        this._collectImages();
        if (this._images.length > 0) {
          this._render();
          this._startTimer();
          return true;
        }
        return false;
      };

      // Try once on next frame (fast path)
      requestAnimationFrame(() => {
        if (tryCollectAndRender()) return;
      });

      // Observe light DOM children for images being added
      const mo = new MutationObserver((mutations, observer) => {
        if (tryCollectAndRender()) {
          observer.disconnect();
        }
      });
      mo.observe(this, { childList: true, subtree: true });
    } else {
      this._render();
      this._startTimer();
    }
  }

  disconnectedCallback() {
    this._stopTimer();
  }

  _collectImages() {
    const imgs = Array.from(this.querySelectorAll("img"));
    this._images = imgs.map((img) => ({
      src: img.getAttribute("src"),
      alt: img.getAttribute("alt") || "",
    }));
  }

  _render() {
    const total = this._images.length;
    const wrapper = document.createElement("div");
    wrapper.className = "slider-root";

    const style = document.createElement("style");
    style.textContent = `
        :host { display:block; max-width: 900px; margin: 16px auto; }
        .slider-root { position: relative; overflow: hidden; border-radius: 8px; box-shadow: 0 6px 18px rgba(0,0,0,0.6); aspect-ratio: 16/9; min-height: 220px; }
        .slides { position: relative; width:100%; height:100%; z-index: 0; }
        .slide { position: absolute; inset: 0; display:flex; align-items:center; justify-content:center; z-index: 0; }
        .slide img { width:100%; height:100%; display:block; object-fit:cover; }
        .slide { opacity: 0; transform: scale(1.02); transition: opacity 600ms ease, transform 600ms ease; }
        .slide.active { opacity: 1; transform: scale(1); z-index: 0; }
        .controls { position: absolute; inset: 0; pointer-events: none; z-index: 10; }
        .nav { position: absolute; top:50%; transform: translateY(-50%); background: rgba(0,0,0,0.45); color:#fff; border:none; padding:10px 12px; cursor:pointer; border-radius:50%; pointer-events: auto; z-index: 11; }
        .nav.left { left:12px }
        .nav.right { right:12px }
        .counter { position: absolute; right: 12px; bottom: 12px; background: rgba(0,0,0,0.55); color: #fff; padding: 6px 10px; border-radius: 12px; font-size: 13px; pointer-events: auto; z-index: 11; }
        .dots { position: absolute; left:50%; transform: translateX(-50%); bottom: 12px; display:flex; gap:8px; pointer-events: auto; z-index: 11; }
        .dot { width:10px; height:10px; border-radius:50%; background: rgba(255,255,255,0.45); border:none; padding:0; cursor:pointer; }
        .dot.active { background: #fff; box-shadow: 0 0 0 3px rgba(255,255,255,0.08); }
        :host(:hover) .nav { background: rgba(0,0,0,0.6); }
        @media (max-width:600px){ .nav{ padding:8px } }
      `;

    // build slides
    const slidesEl = document.createElement("div");
    slidesEl.className = "slides";

    this._slideEls = [];
    for (let i = 0; i < total; i++) {
      const s = document.createElement("div");
      s.className = "slide";
      const im = document.createElement("img");
      im.src = this._images[i].src;
      im.alt = this._images[i].alt || "";
      s.appendChild(im);
      slidesEl.appendChild(s);
      this._slideEls.push(s);
    }

    // controls overlay
    const controls = document.createElement("div");
    controls.className = "controls";

    const left = document.createElement("button");
    left.className = "nav left";
    left.setAttribute("aria-label", "Anterior");
    left.textContent = "‹";
    left.addEventListener("click", (e) => {
      e.stopPropagation();
      this.prev();
    });

    const right = document.createElement("button");
    right.className = "nav right";
    right.setAttribute("aria-label", "Siguiente");
    right.textContent = "›";
    right.addEventListener("click", (e) => {
      e.stopPropagation();
      this.next();
    });

    // counter
    const counter = document.createElement("div");
    counter.className = "counter";
    counter.textContent = `${this._current + 1} of ${total}`;

    // dots / indicators
    const dots = document.createElement("div");
    dots.className = "dots";
    this._dotButtons = [];
    for (let i = 0; i < total; i++) {
      const b = document.createElement("button");
      b.className = "dot";
      b.setAttribute("aria-label", `Ir a ${i + 1}`);
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this.showIndex(i);
        this._restartTimer();
      });
      dots.appendChild(b);
      this._dotButtons.push(b);
    }

    controls.appendChild(left);
    controls.appendChild(right);
    wrapper.appendChild(style);
    wrapper.appendChild(slidesEl);
    wrapper.appendChild(controls);
    wrapper.appendChild(counter);
    wrapper.appendChild(dots);

    this._root.innerHTML = "";
    this._root.appendChild(wrapper);

    this._counterEl = counter;
    this._dotsEl = dots;

    // set initial active
    this._updateActive();

    // pause on hover
    wrapper.addEventListener("mouseenter", () => this._stopTimer());
    wrapper.addEventListener("mouseleave", () => this._startTimer());
  }

  showIndex(idx) {
    const total = this._images.length;
    if (total === 0) return;
    this._current = ((idx % total) + total) % total;
    this._updateActive();
  }

  _updateActive() {
    const total = this._images.length;
    for (let i = 0; i < this._slideEls.length; i++) {
      const s = this._slideEls[i];
      if (i === this._current) s.classList.add("active");
      else s.classList.remove("active");
    }
    if (this._counterEl) this._counterEl.textContent = `${this._current + 1} of ${total}`;
    if (this._dotButtons) {
      this._dotButtons.forEach((b, idx) => {
        if (idx === this._current) b.classList.add("active");
        else b.classList.remove("active");
      });
    }
  }

  next() {
    this.showIndex(this._current + 1);
    this._restartTimer();
  }

  prev() {
    this.showIndex(this._current - 1);
    this._restartTimer();
  }

  _startTimer() {
    if (this._timer != null) return;
    this._timer = setInterval(() => this.showIndex(this._current + 1), this._interval);
  }

  _stopTimer() {
    if (this._timer != null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  _restartTimer() {
    this._stopTimer();
    this._startTimer();
  }
}

customElements.define("image-slider", ImageSlider);
