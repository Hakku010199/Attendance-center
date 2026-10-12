import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ToastProvider } from "./components/common/Toast.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import "./styles/global.css";

createRoot(document.getElementById("root")).render(
  <BrowserRouter><ToastProvider><AuthProvider><ThemeProvider><App /></ThemeProvider></AuthProvider></ToastProvider></BrowserRouter>
);
