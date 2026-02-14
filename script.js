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
          a.textContent = item.name || "";
          a.href = item.url || "#";
          const span = document.createElement("span");
          span.textContent = item.handle || "";
          li.appendChild(a);
          li.appendChild(span);
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
