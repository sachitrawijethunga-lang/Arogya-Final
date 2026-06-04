import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import StaffApp from "./staff/StaffApp.tsx";
import "./index.css";

// The staff portal and the patient kiosk share one bundle; the URL path picks which.
const path = window.location.pathname.replace(/\/+$/, "");
const isStaff = path.endsWith("/staff");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isStaff ? <StaffApp /> : <App />}</StrictMode>,
);
