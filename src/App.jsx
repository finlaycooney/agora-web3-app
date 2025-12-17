import React from 'react';
import { Routes, Route } from 'react-router-dom'; // Removed 'BrowserRouter' and unused 'Link'
import Footer from './components/common/Footer';
import Header from './components/common/Header';
import HomePage from './pages/HomePage';
import useScrollHandler from './hooks/useScrollHandler';
import ForEmployers from './pages/ForEmployers';
import JobsBoard from './pages/JobsBoard';

// CSS Imports
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

function App() {
  const isHeaderVisible = useScrollHandler();

  return (

    <>
      <Header isVisible={isHeaderVisible} />

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/for-employers" element={<ForEmployers />} />
        <Route path="/JobsBoard" element={<JobsBoard />} />
      </Routes>

      <Footer />
    </>
  );
}

export default App;