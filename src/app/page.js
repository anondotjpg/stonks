'use client';

import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import TokensList from './components/TokensList'
import RecentBuys from './components/SBuys'
import Copy from './components/copy.js'
import Link from 'next/link'
import Marquee from 'react-fast-marquee'

const words = ['creators.', 'causes.', 'people.', 'projects.', 'anything.']

function AnimatedWord() {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prevIndex) => (prevIndex + 1) % words.length)
    }, 3000) // Change word every 2.5 seconds

    return () => clearInterval(interval)
  }, [])

  const exitVariants = {
    initial: { opacity: 1, y: 0 },
    exit: { 
      opacity: 0, 
      y: 20,
      transition: {
        duration: 0.2,
        ease: "easeInOut"
      }
    }
  }

  const enterVariants = {
    initial: { opacity: 0, y: -10 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.2,
        ease: "easeInOut"
      }
    }
  }

  return (
    <span className="inline-block w-32 text-center">
      <AnimatePresence mode="wait">
        <motion.span
          key={currentWordIndex}
          variants={enterVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          className="inline-block"
        >
          {words[currentWordIndex]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

function BackgroundMarquee() {
  return (
    <div className="fixed inset-0 translate-y-[200px] overflow-hidden pointer-events-none z-10 hidden lg:block">
      <Marquee 
        speed={150}
        gradient={false}
        className="text-6xl md:text-8xl font-black text-white/15 select-none"
      >
        <span className="mx-8">MEME</span>
        <img 
          src="coin.gif" 
          alt="coin" 
          className="mx-6 w-12 h-12 md:w-24 md:h-24 inline-block opacity-15"
        />
        <span className="mx-8">CREATE</span>
        <img 
          src="coin.gif" 
          alt="coin" 
          className="mx-6 w-12 h-12 md:w-24 md:h-24 inline-block opacity-15"
        />
        <span className="mx-8">COLLECT</span>
        <img 
          src="coin.gif" 
          alt="coin" 
          className="mx-6 w-12 h-12 md:w-24 md:h-24 inline-block opacity-15"
        />
        <span className="mx-8">MEME</span>
        <img 
          src="coin.gif" 
          alt="coin" 
          className="mx-6 w-12 h-12 md:w-24 md:h-24 inline-block opacity-15"
        />
        <span className="mx-8">CREATE</span>
        <img 
          src="coin.gif" 
          alt="coin" 
          className="mx-6 w-12 h-12 md:w-24 md:h-24 inline-block opacity-15"
        />
        <span className="mx-8">COLLECT</span>
        <img 
          src="coin.gif" 
          alt="coin" 
          className="mx-6 w-12 h-12 md:w-24 md:h-24 inline-block opacity-15"
        />
      </Marquee>
    </div>
  )
}

export default function Home() {
  return (
    <div className="min-h-screen bg-[#000] py-12 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="absolute top-5 left-[9%]">
          <img src="/print.png" className='w-[50px] h-auto' />
        </div>

        <div className='absolute top-4 -translate-x-1/2 left-1/2 hidden'>
          <div className='flex justify-center space-x-2'>
            <div className='bg-[#FDF355] w-44 p-4'>

            </div>
            <div className='bg-[#9EC4F8] w-32 p-4'>
              
            </div>
          </div>
        </div>

        <div className='absolute top-5 right-[9%]'>
          <div className='flex justify-center items-center gap-2'>
            <Link
              href="https://x.com"
              className="py-2 text-white mb-[9px] rounded-lg text-base font-medium"
            >
              𝕏
            </Link>
            <Link
              href="/FAQ"
              className="pr-2 pl-1 py-2 text-white mb-2 rounded-lg text-sm font-medium"
            >
              FAQs
            </Link>
          </div>
        </div>
        

        {/* Main Content */}
        <div className='grid items-start mt-[7.5%] md:mt-[5%] gap-2'>
          <div className='w-full flex justify-center relative'>
            {/* Background Marquee */}
            <BackgroundMarquee />
            
            <div className='w-full md:w-[50%] bg-[#000] relative z-20 lg:[mask-image:linear-gradient(to_right,transparent_0%,black_10%,black_90%,transparent_100%)] lg:[webkit-mask-image:linear-gradient(to_right,transparent_0%,black_10%,black_90%,transparent_100%)]'> 
              <div className="relative z-20">
                <div className='w-full flex justify-center mb-1'> 
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1], }} 
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }} 
                    style={{ willChange: "transform, opacity", backfaceVisibility: "hidden", perspective: 1000 }} 
                    className="transform-gpu" 
                  > 
                    <Link href="/create" className="inline-block px-4 py-2 text-gray-300 font-medium mb-2 text-xl hover:text-white transition-colors" > 
                      [create] 
                    </Link> 
                  </motion.div> 
                </div> 
                <div className='text-center text-4xl md:text-6xl text-balance font-bold text-white mb-2 whitespace-nowrap'> 
                  All Roads Lead 
                </div> 
                <div className='text-center text-4xl md:text-6xl text-balance font-bold text-white mb-2'> 
                  to Meme 
                </div> 
                <div className='text-center text-sm md:text-base text-balance text-gray-300 mb-4 mx-[20%]'> 
                  100% of value stays in the ecosystem 
                </div> 
              </div>
            </div>
          </div>

          {/* Tokens List Section */}
          <div className='w-full'>
            <TokensList />
          </div>

          <div className='w-screen mt-8'>
            <RecentBuys />
          </div>
        </div>
      </div>
    </div>
  )
}