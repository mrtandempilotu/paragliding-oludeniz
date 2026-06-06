import type { Metadata } from 'next'
import { Phone, Mail, MapPin, MessageCircle, Clock } from 'lucide-react'
import PageHero from '@/components/shared/PageHero'
import BreadcrumbNav from '@/components/shared/BreadcrumbNav'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'contact' })
  return {
    title: `${t('title')} | Paragliding Ölüdeniz`,
    alternates: { canonical: 'https://paragliding-oludeniz.com/contact' },
  }
}

export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'contact' })

  return (
    <>
      <PageHero title={t('title')} subtitle={t('subtitle')} size="sm" />
      <div className="bg-slate-50 border-b border-slate-200">
        <div className="container-default py-3">
          <BreadcrumbNav items={[{ label: t('title') }]} />
        </div>
      </div>
      <section className="section-padding bg-white">
        <div className="container-default">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-8">{t('getInTouch')}</h2>
              <div className="space-y-5">
                <a href="https://wa.me/905364616674" target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-4 p-5 bg-green-50 border border-green-200 rounded-2xl hover:bg-green-100 transition-colors group">
                  <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-green-800 mb-1">{t('whatsapp')}</p>
                    <p className="text-green-700 text-lg font-semibold">+90 536 461 6674</p>
                    <p className="text-green-600 text-sm mt-1">{t('whatsappDesc')}</p>
                  </div>
                </a>
                <a href="tel:+905364616674" className="flex items-start gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors">
                  <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Phone className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 mb-1">{t('phone')}</p>
                    <p className="text-slate-700 text-lg font-semibold">+90 536 461 6674</p>
                    <p className="text-slate-500 text-sm mt-1">{t('phoneDesc')}</p>
                  </div>
                </a>
                <a href="mailto:info@paragliding-oludeniz.com" className="flex items-start gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-slate-100 transition-colors">
                  <div className="w-12 h-12 bg-sky-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 mb-1">{t('email')}</p>
                    <p className="text-slate-700 font-semibold">info@paragliding-oludeniz.com</p>
                    <p className="text-slate-500 text-sm mt-1">{t('emailDesc')}</p>
                  </div>
                </a>
                <div className="flex items-start gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 mb-1">{t('location')}</p>
                    <p className="text-slate-600">{t('locationDesc')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Clock className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 mb-1">{t('hours')}</p>
                    <p className="text-slate-600">{t('hoursDesc')}</p>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-8">{t('sendMessage')}</h2>
              <form className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('yourName')}</label>
                  <input type="text" className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('yourEmail')}</label>
                  <input type="email" className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">{t('yourMessage')}</label>
                  <textarea rows={5} className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none" />
                </div>
                <button type="submit" className="btn-primary w-full justify-center">{t('send')}</button>
              </form>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-white pb-16">
        <div className="container-default">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Find Us</h2>
          <div className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 w-full h-96">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3185.8!2d29.1164!3d36.5497"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Paragliding Oludeniz Location"
            />
          </div>
          <p className="text-slate-500 text-sm mt-3">
            📍 Ölüdeniz Mahallesi, Elekli Caddesi, 48000 Fethiye/Muğla, Türkiye
          </p>
        </div>
      </section>
    </>
  )
}
