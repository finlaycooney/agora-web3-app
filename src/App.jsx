import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import * as THREE from 'three';
import Footer from './components/common/Footer';
import Header from './components/common/Header';
import HomePage from './pages/HomePage';
import useScrollHandler from './hooks/useScrollHandler';
import ForEmployers from './pages/ForEmployers';
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";



// Main App Component
function App() {
  const isHeaderVisible = useScrollHandler();
  return (
    <Router> {/* <-- 1. Wrap everything in the Router */}
      <Header isVisible={isHeaderVisible} />

      <Routes> {/* <-- 2. Define the area where pages will swap */}
        <Route path="/" element={<HomePage />} /> {/* <-- Shows HomePage at the base URL */}
        <Route path="/for-employers" element={<ForEmployers />} /> {/* <-- Shows new page at /for-employers */}
      </Routes>

      <Footer />
    </Router>
  );
}

export default App;