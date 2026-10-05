import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ToastProvider } from "./components/common/Toast.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./styles/global.css";

createRoot(document.getElementById("root")).render(
  <BrowserRouter><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></BrowserRouter>
);
