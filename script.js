const parallaxItems = document.querySelectorAll("[data-parallax]");
const menuToggle = document.querySelector(".menu-toggle");
const mobileMenu = document.getElementById("mobileMenu");
const body = document.body;
const heroLogo = document.querySelector(".hero-logo");
const heroScrollBtn = document.querySelector(".hero-scroll");
const collectionsGrid = document.getElementById("collectionsGrid");
const heroTitle = document.getElementById("heroTitle");
const heroSubtitle = document.getElementById("heroSubtitle");
const heroMeta = document.getElementById("heroMeta");
const visionTitle = document.getElementById("visionTitle");
const aboutText = document.getElementById("aboutText");
const contactEmail = document.getElementById("contactEmail");
const contactCities = document.getElementById("contactCities");
const socialList = document.getElementById("socialList");

const revealOnScroll = () => {
  const trigger = window.innerHeight * 0.85;
  document.querySelectorAll(".reveal").forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top < trigger) {
      el.classList.add("visible");
    }
  });
};

const parallax = () => {
  const offset = window.scrollY * 0.15;
  parallaxItems.forEach((item) => {
    item.style.transform = `translateY(${offset}px)`;
  });
};

const handleHeaderSwap = () => {
  if (window.scrollY > 60) {
    body.classList.add("scrolled");
  } else {
    body.classList.remove("scrolled");
  }
};

const handleLogoMotion = () => {
  if (!heroLogo) return;
  const scrollY = window.scrollY;
  const tilt = Math.min(10, scrollY / 80);
  const rot = Math.sin(scrollY / 180) * 3;
  heroLogo.style.setProperty("--logo-tilt", `${tilt}deg`);
  heroLogo.style.setProperty("--logo-rot", `${rot}deg`);
};

if (menuToggle && mobileMenu) {
  menuToggle.addEventListener("click", () => {
    mobileMenu.classList.toggle("open");
  });
}

if (heroScrollBtn) {
  heroScrollBtn.addEventListener("click", () => {
    const target = document.querySelector("#collections");
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
    }
  });
}

window.addEventListener("scroll", () => {
  revealOnScroll();
  parallax();
  handleHeaderSwap();
  handleLogoMotion();
});

window.addEventListener("load", () => {
  revealOnScroll();
  handleHeaderSwap();
  handleLogoMotion();
  loadContent();
});

const loadContent = async () => {
  try {
    const [siteRes, collectionsRes] = await Promise.all([
      fetch("data/site.json"),
      fetch("data/collections.json"),
    ]);

    if (siteRes.ok) {
      const siteData = await siteRes.json();
      if (heroTitle) heroTitle.textContent = siteData.hero_title || heroTitle.textContent;
      if (heroSubtitle) heroSubtitle.textContent = siteData.hero_subtitle || heroSubtitle.textContent;
      if (visionTitle) visionTitle.textContent = siteData.vision_title || visionTitle.textContent;
      if (aboutText) aboutText.textContent = siteData.about_text || aboutText.textContent;
      if (contactEmail) contactEmail.textContent = siteData.contact_email || contactEmail.textContent;
      if (contactCities) contactCities.textContent = siteData.contact_cities || contactCities.textContent;

      if (heroMeta && Array.isArray(siteData.hero_meta)) {
        heroMeta.innerHTML = "";
        siteData.hero_meta.forEach((item) => {
          const span = document.createElement("span");
          span.textContent = item;
          heroMeta.appendChild(span);
        });
      }

      if (socialList && Array.isArray(siteData.socials)) {
        socialList.innerHTML = "";
        siteData.socials.forEach((item) => {
          const li = document.createElement("li");
          const a = document.createElement("a");
          a.className = "social-link";
          a.href = item.url || "#";
          a.target = "_blank";
          a.rel = "noopener";
          a.setAttribute("aria-label", item.name || "Réseau");
          a.innerHTML = `${getSocialIcon(item.name)}`;
          li.appendChild(a);
          socialList.appendChild(li);
        });
      }
    }

    if (collectionsRes.ok && collectionsGrid) {
      const collectionsData = await collectionsRes.json();
      const items = collectionsData.items || [];
      collectionsGrid.innerHTML = "";
      items.forEach((item) => {
        const article = document.createElement("article");
        article.className = "card reveal";

        const link = document.createElement("a");
        link.href = item.link || "product.html";

        const media = document.createElement("div");
        media.className = "card-media";
        if (item.image) {
          media.style.background = `url('${item.image}') center/cover no-repeat`;
        }

        if (item.tag) {
          const tag = document.createElement("div");
          tag.className = "tag";
          tag.textContent = item.tag;
          media.appendChild(tag);
        }

        const body = document.createElement("div");
        body.className = "card-body";
        const title = document.createElement("h3");
        title.textContent = item.title || "";
        const desc = document.createElement("p");
        desc.textContent = item.description || "";
        body.appendChild(title);
        body.appendChild(desc);

        if (item.price) {
          const price = document.createElement("span");
          price.className = "price";
          price.textContent = item.price;
          body.appendChild(price);
        }

        link.appendChild(media);
        link.appendChild(body);
        article.appendChild(link);
        collectionsGrid.appendChild(article);
      });

      addAddButton();
      revealOnScroll();
    } else if (collectionsGrid) {
      collectionsGrid.innerHTML = "";
      addAddButton();
    }
  } catch (error) {
    console.error("Content load error", error);
    if (collectionsGrid) {
      collectionsGrid.innerHTML = "";
      addAddButton();
    }
  }
};

const getSocialIcon = (name = "") => {
  const key = name.toLowerCase();
  if (key.includes("instagram")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zm10 2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm-5 3.5A4.5 4.5 0 1 1 7.5 13 4.5 4.5 0 0 1 12 8.5zm0 2A2.5 2.5 0 1 0 14.5 13 2.5 2.5 0 0 0 12 10.5zM18 6.5a1 1 0 1 1-1 1 1 1 0 0 1 1-1z"/></svg>`;
  }
  if (key.includes("snap")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c2.7 0 4.5 2 4.5 4.8 0 .5 0 1 .1 1.3.2.6 1 .9 1.6 1.1 1 .4 1.3 1 .9 1.6-.4.6-1.3 1-2.1 1.2-.5.2-.6.4-.3 1 .3.7 1 1.5 1.8 2 .8.5.9 1.2.3 1.6-.6.4-1.6.5-2.6.2-.6-.2-1.1-.1-1.5.3-.5.5-1.4 1.2-2.7 1.2s-2.2-.7-2.7-1.2c-.4-.4-.9-.5-1.5-.3-1 .3-2 .2-2.6-.2-.6-.4-.5-1.1.3-1.6.8-.5 1.5-1.3 1.8-2 .3-.6.2-.8-.3-1-.8-.2-1.7-.6-2.1-1.2-.4-.6-.1-1.2.9-1.6.6-.2 1.4-.5 1.6-1.1.1-.3.1-.8.1-1.3C7.5 5 9.3 3 12 3z"/></svg>`;
  }
  if (key.includes("tiktok")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3c.3 2.2 2 3.9 4.2 4.2V9c-1.5-.1-2.8-.7-3.8-1.6V15a5 5 0 1 1-5-5c.3 0 .7 0 1 .1v2a3 3 0 1 0 2 2.8V3h1.6z"/></svg>`;
  }
  if (key.includes("youtube")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M23 12s0-3.3-.4-4.8c-.2-.9-1-1.6-1.9-1.8C18.6 5 12 5 12 5s-6.6 0-8.7.4c-.9.2-1.7.9-1.9 1.8C1 8.7 1 12 1 12s0 3.3.4 4.8c.2.9 1 1.6 1.9 1.8 2.1.4 8.7.4 8.7.4s6.6 0 8.7-.4c.9-.2 1.7-.9 1.9-1.8.4-1.5.4-4.8.4-4.8zM10 15V9l5 3-5 3z"/></svg>`;
  }
  if (key.includes("audiomack")) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v3H4V6zm0 4h16v3H4v-3zm0 4h10v3H4v-3z"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>`;
};

const addAddButton = () => {
  const article = document.createElement("article");
  article.className = "card reveal add-card";
  const link = document.createElement("a");
  link.className = "add-link";
  link.href = "/admin/";
  link.target = "_blank";
  link.rel = "noopener";
  link.innerHTML = "<span>+</span><small>Ajouter</small>";
  article.appendChild(link);
  collectionsGrid.appendChild(article);
};
