import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/*
  SETUP REQUIRED:
  1. Create a Supabase project.
  2. Run supabase/schema.sql in Supabase SQL Editor.
  3. Paste your Project URL and publishable/anon key below.
  Never paste a service_role or secret key into this browser file.
*/
const SUPABASE_URL = "https://bhilidrsfywmpbgkvqqk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Q0MBDPLBy2s21plzM_uHLg_wksPSnG-";

const $ = (selector) => document.querySelector(selector);
const authView = $("#auth-view");
const dashboardView = $("#dashboard-view");
const authForm = $("#auth-form");
const authMessage = $("#auth-message");
const authSubmit = $("#auth-submit");
const tripDialog = $("#trip-dialog");
const tripForm = $("#trip-form");
const tripMessage = $("#trip-message");
const tripList = $("#trip-list");
const emptyState = $("#empty-state");
const toast = $("#toast");

let supabase = null;
let authMode = "login";
let trips = [];
let currentUser = null;
let toastTimer = null;

function setMessage(element, message = "", success = false) {
  element.textContent = message;
  element.classList.toggle("success", Boolean(message) && success);
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}
function setBusy(button, busy, label) {
  if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.originalLabel;
}
function formatDate(dateString) {
  if (!dateString) return "Not set";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Not set";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}
function formatMoney(amount, currency) {
  if (amount === null || amount === undefined || amount === "") return "Not set";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(amount));
  } catch {
    return `${amount} ${currency || ""}`.trim();
  }
}
function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
function setAuthMode(mode) {
  authMode = mode;
  const login = mode === "login";
  $("#login-tab").classList.toggle("active", login);
  $("#signup-tab").classList.toggle("active", !login);
  $("#login-tab").setAttribute("aria-selected", String(login));
  $("#signup-tab").setAttribute("aria-selected", String(!login));
  $("#auth-heading").textContent = login ? "Welcome back" : "Create your account";
  $("#auth-subheading").textContent = login ? "Sign in to continue planning." : "Create an account to keep your trips private.";
  authSubmit.textContent = login ? "Sign in" : "Create account";
  $("#password").autocomplete = login ? "current-password" : "new-password";
  setMessage(authMessage);
}
function showSignedOut() {
  currentUser = null;
  authView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  $("#sign-out-btn").classList.add("hidden");
  $("#user-label").textContent = "";
}
function showSignedIn(user) {
  currentUser = user;
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  $("#sign-out-btn").classList.remove("hidden");
  $("#user-label").textContent = user.email || "Signed in";
}
function configurationReady() {
  return SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("PASTE_YOUR") &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes("PASTE_YOUR");
}
async function loadTrips() {
  if (!supabase || !currentUser) return;
  $("#refresh-btn").disabled = true;
  tripList.innerHTML = '<div class="loading-card">Loading your trips…</div>';
  try {
    const { data, error } = await supabase
      .from("trips")
      .select("id, owner_id, name, destination, start_date, end_date, currency, budget, trip_type, group_size, goal, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    trips = data || [];
    renderTrips();
  } catch (error) {
    tripList.innerHTML = "";
    showToast(`Could not load trips: ${error.message}`);
  } finally {
    $("#refresh-btn").disabled = false;
  }
}
function renderTrips() {
  $("#total-trips").textContent = String(trips.length);
  $("#total-destinations").textContent = String(new Set(trips.map((trip) => trip.destination.trim().toLowerCase()).filter(Boolean)).size);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  $("#upcoming-trips").textContent = String(trips.filter((trip) => !trip.start_date || new Date(`${trip.start_date}T12:00:00`) >= today).length);
  emptyState.classList.toggle("hidden", trips.length > 0);
  tripList.classList.toggle("hidden", trips.length === 0);
  if (!trips.length) { tripList.innerHTML = ""; return; }
  tripList.innerHTML = trips.map((trip) => `
    <article class="trip-card">
      <div class="trip-card-top"><div class="trip-emoji">✈</div><span class="trip-type">${safeText(trip.trip_type || "Trip")}</span></div>
      <h3>${safeText(trip.name)}</h3>
      <p class="trip-destination">⌖ ${safeText(trip.destination)}</p>
      <div class="trip-meta"><span>${safeText(formatDate(trip.start_date))}</span><span>${safeText(formatMoney(trip.budget, trip.currency))}</span></div>
      <div class="trip-card-actions">
        <button class="button button-secondary" type="button" data-action="view" data-id="${safeText(trip.id)}">View details</button>
        <button class="button button-quiet" type="button" data-action="delete" data-id="${safeText(trip.id)}">Delete</button>
      </div>
    </article>`).join("");
}
function openTripDetails(trip) {
  $("#trip-detail-content").innerHTML = `
    <div class="dialog-heading"><div><p class="eyebrow">TRIP OVERVIEW</p><h2 class="detail-title">${safeText(trip.name)}</h2></div><button class="icon-button" id="close-detail-btn" type="button" aria-label="Close">×</button></div>
    <p class="detail-destination">⌖ ${safeText(trip.destination)}</p>
    <div class="detail-list">
      <div class="detail-item"><small>Start date</small><strong>${safeText(formatDate(trip.start_date))}</strong></div>
      <div class="detail-item"><small>End date</small><strong>${safeText(formatDate(trip.end_date))}</strong></div>
      <div class="detail-item"><small>Estimated budget</small><strong>${safeText(formatMoney(trip.budget, trip.currency))}</strong></div>
      <div class="detail-item"><small>Trip type</small><strong>${safeText(trip.trip_type || "Not set")}</strong></div>
      <div class="detail-item"><small>Group size</small><strong>${safeText(trip.group_size ?? 1)}</strong></div>
      <div class="detail-item"><small>Currency</small><strong>${safeText(trip.currency || "USD")}</strong></div>
    </div>
    <div class="detail-item" style="margin-top:12px"><small>Trip goal / notes</small><div class="detail-notes">${safeText(trip.goal || "No notes added yet.")}</div></div>
    <div class="dialog-actions"><button id="detail-done-btn" class="button button-primary" type="button">Done</button></div>`;
  $("#close-detail-btn").addEventListener("click", () => $("#detail-dialog").close());
  $("#detail-done-btn").addEventListener("click", () => $("#detail-dialog").close());
  $("#detail-dialog").showModal();
}
async function deleteTrip(id) {
  const trip = trips.find((item) => item.id === id);
  if (!trip || !window.confirm(`Delete "${trip.name}"? This cannot be undone.`)) return;
  try {
    const { error } = await supabase.from("trips").delete().eq("id", id);
    if (error) throw error;
    trips = trips.filter((item) => item.id !== id);
    renderTrips();
    showToast("Trip deleted.");
  } catch (error) {
    showToast(`Could not delete trip: ${error.message}`);
  }
}
function openNewTripDialog() {
  tripForm.reset();
  $("#group-size").value = "1";
  $("#currency").value = "USD";
  $("#trip-type").value = "Vacation";
  setMessage(tripMessage);
  tripDialog.showModal();
}
async function initialize() {
  if (!configurationReady()) {
    showSignedOut();
    setMessage(authMessage, "Setup needed: add your Supabase Project URL and publishable/anon key in app.js.");
    authSubmit.disabled = true;
    return;
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) showToast(`Authentication check failed: ${error.message}`);
  if (session?.user) {
    showSignedIn(session.user);
    await loadTrips();
  } else showSignedOut();
  supabase.auth.onAuthStateChange((event, sessionNow) => {
    if (sessionNow?.user) {
      showSignedIn(sessionNow.user);
      // Defer network work until after the auth callback completes.
      setTimeout(() => loadTrips(), 0);
    } else showSignedOut();
  });
}

$("#login-tab").addEventListener("click", () => setAuthMode("login"));
$("#signup-tab").addEventListener("click", () => setAuthMode("signup"));
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) {
    setMessage(authMessage, "Please finish the Supabase setup in app.js first.");
    return;
  }
  const email = $("#email").value.trim();
  const password = $("#password").value;
  setBusy(authSubmit, true, authMode === "login" ? "Signing in…" : "Creating…");
  setMessage(authMessage);
  try {
    if (authMode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) {
        setMessage(authMessage, "Account created. You're signed in.", true);
        showSignedIn(data.user);
        await loadTrips();
      } else {
        setMessage(authMessage, "Account created. Check your email to confirm it, then sign in.", true);
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      showSignedIn(data.user);
      await loadTrips();
      setMessage(authMessage);
    }
  } catch (error) {
    setMessage(authMessage, error.message || "Authentication failed. Please try again.");
  } finally {
    setBusy(authSubmit, false);
  }
});
$("#sign-out-btn").addEventListener("click", async () => {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) showToast(`Could not sign out: ${error.message}`);
  else { showSignedOut(); trips = []; showToast("Signed out."); }
});
$("#new-trip-btn").addEventListener("click", openNewTripDialog);
$("#empty-new-trip-btn").addEventListener("click", openNewTripDialog);
$("#close-dialog-btn").addEventListener("click", () => tripDialog.close());
$("#cancel-trip-btn").addEventListener("click", () => tripDialog.close());
$("#refresh-btn").addEventListener("click", loadTrips);
tripList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const trip = trips.find((item) => item.id === button.dataset.id);
  if (!trip) return;
  if (button.dataset.action === "view") openTripDetails(trip);
  if (button.dataset.action === "delete") deleteTrip(trip.id);
});
tripForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !currentUser) {
    setMessage(tripMessage, "You must be signed in before creating a trip.");
    return;
  }
  const startDate = $("#start-date").value || null;
  const endDate = $("#end-date").value || null;
  if (startDate && endDate && endDate < startDate) {
    setMessage(tripMessage, "End date must be on or after the start date.");
    return;
  }
  
  
  const rawBudget = $("#budget").value;
  const payload = {
    owner_id: currentUser.id,
    invite_code: crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(),
    name: $("#trip-name").value.trim(),
    destination: $("#destination").value.trim(),
    start_date: startDate,
    end_date: endDate,
    currency: $("#currency").value,
    budget: rawBudget === "" ? null : Number(rawBudget),
    trip_type: $("#trip-type").value,
    group_size: Number($("#group-size").value),
    goal: $("#goal").value.trim()
};
  const saveButton = $("#save-trip-btn");
  setBusy(saveButton, true, "Creating…");
  setMessage(tripMessage);
  try {
    const { data, error } = await supabase.from("trips").insert(payload).select().single();
    if (error) throw error;
    trips.unshift(data);
    renderTrips();
    tripDialog.close();
    showToast("Trip created successfully.");
  } catch (error) {
    setMessage(tripMessage, `Trip was not created: ${error.message}`);
  } finally {
    setBusy(saveButton, false);
  }
});

initialize().catch((error) => {
  console.error("App initialization failed:", error);
  setMessage(authMessage, `Could not initialize the app: ${error.message}`);
});
