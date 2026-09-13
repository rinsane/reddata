/* Transient messages, pinned top-centre.

   The countdown is driven by the Web Animations API rather than a CSS class
   plus a setTimeout, so the bar and the dismissal can never drift apart: the
   animation finishing *is* the dismissal. Hovering pauses both together. */

const LIFETIME = { error: 6000, info: 3500 };

let host;

function container() {
  if (host?.isConnected) return host;
  host = document.createElement("div");
  host.className = "toasts";
  document.body.append(host);
  return host;
}

export function toast(message, { kind = "info", ms } = {}) {
  const life = ms ?? LIFETIME[kind] ?? LIFETIME.info;

  const el = document.createElement("div");
  el.className = `toast toast-${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");

  const text = document.createElement("p");
  text.textContent = message;

  const track = document.createElement("span");
  track.className = "toast-track";
  const bar = document.createElement("span");
  track.append(bar);

  el.append(text, track);
  container().prepend(el);

  const dismiss = () => {
    el.style.opacity = "0";
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400); // if transitions are off
  };

  const countdown = bar.animate(
    [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }],
    { duration: life, easing: "linear", fill: "forwards" }
  );
  countdown.onfinish = dismiss;

  el.addEventListener("mouseenter", () => countdown.pause());
  el.addEventListener("mouseleave", () => countdown.play());
  el.addEventListener("click", dismiss);

  return el;
}

export const fail = (message) => toast(message, { kind: "error" });
export const note = (message) => toast(message, { kind: "info" });
