const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".primary-nav");

if (menuButton && navigation) {
  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
    navigation.classList.toggle("is-open", !isOpen);
  });
}

document.querySelectorAll("form[data-confirm]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});

document.querySelectorAll("form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    if (event.defaultPrevented) return;
    for (const input of form.querySelectorAll("input.date-dmy")) {
      input.setCustomValidity("");
      if (!input.value.trim()) continue;
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.value.trim());
      if (!match) continue;
      const [, dayText, monthText, yearText] = match;
      const day = Number(dayText);
      const month = Number(monthText);
      const year = Number(yearText);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        input.setCustomValidity("Enter a real date in DD/MM/YYYY format.");
        input.reportValidity();
        event.preventDefault();
        return;
      }
      input.value = `${yearText}-${monthText}-${dayText}`;
    }
  });
});

document.querySelectorAll("input.date-dmy").forEach((input) => {
  input.addEventListener("input", () => input.setCustomValidity(""));
});
