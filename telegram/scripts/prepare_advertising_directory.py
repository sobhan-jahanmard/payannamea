"""Prepare reviewed research records from public-profile snapshots."""
import collections
import datetime as dt
import json
import re
from pathlib import Path

from research_advertising_targets import number

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research' / '2026-11-10'
TODAY = dt.date(2026, 11, 10)

def norm(value):
    return value.replace('ي','ی').replace('ك','ک').replace('\u200c',' ').replace('_',' ')

def handles(text):
    found = re.findall(r'(?:@|(?:https?://)?(?:t\.me|telegram\.me)/)([A-Za-z][A-Za-z0-9_]{3,31})',text, flags=re.I)
    return list(dict.fromkeys('@'+x for x in found))

# Explicitly reviewed routing corrections. A route on a parent profile is kept
# as an indirect route rather than treated as acceptance by its child group.
CONTACTS = {
 'mastertest':'@Ads_PhDTest','phdtest':'@Ads_PhDTest','heiatelmi':'@Ads_PhDTest',
 'asatidebeheshti':'@the_advertise','psy_work':'@adspsyc','artdoc':'@honarpazhouh',
 'project_board':'@ad_project_board','porozhehyab':'@hamid2288278',
 'prozhebegir_ir':'@prozhebegir_admin','projectt_daneshjoo':'@mr_admiinn',
 'sut_tw':'@ads_sut','orzhans_iaum':'@Orzhans_admin',
 'wtiau_3':'@El_ashkin_mariachi97','umzmedia':'@AloUmz','umziha':'@AloUmz','ubasu':'@ad_youbasu',
 'shirazu_twitter':'@shirazu_ad','you_basu':'@ad_youbasu',
 'azad_daneshgah':'@uni_admin','shokat_news':'@apryorism',
 'daneshjobojnord':'@Amirgarivani','uni_yasouj':'@yasouj_ads',
 'ub_tweet':'@Ub_ads','qomunichannel':'@QomUniAd',
 'khabgahpardis':'@Khabgahpardisub','tehrangharb_daneshgah':'@uni_aghfa',
 'tehranjonob_daneshgah':'@uni_mndri','tehranshargh_daneshgah':'@uni_mndri',
 'hesabdaridahom':'@ali_xwz','iauamozeshyar':'@Mehrdad1070',
 'twitterjoo':'@hadiashraf1','yussa_news':'@YUSSA_Admin',
 'medicall_students':'@medicall_students2','medicine_stu':'@Ad_Medicine_stu',
 'hesabdari_daneshjo':'@ali_xwz','newstnb':'@newstnb_pm',
 'uoktweet':'@uoktweet','srbtwitter':'@ad_aloo',
 'sedayedaneshjoo_lu':'@sedayedaneshjoolu_admin',
 'law_scu':'@anjoman_chamran','yasujuni_channel':'@yasujuni',
 'azar_university':'','bualisinauoni':'https://t.me/bualisinauoni?direct',
 'atu_acc':'https://t.me/atu_acc?direct',
 'iust_group':'','clubi':'iedepcrm@gmail.com',
 'uniofkashan':'','university_rodehen':'',
 'yazdunion':'@YazdUnionAds',
 'channelfarhangiyan':'@Sabte_9_7',
 'edultms':'@tablighatkh','ltmssoal':'@tablighatkhob',
 'noandishanhesabdari':'@Mehd_369i',
 'ads_sut':'@sut_tw_admin','civiltv':'@TehranENG_Support',
 'ads_danshjo':'@plus_d','tablighatgostardeee':'@a_y_jamali',
 'tnbshop':'@a_y_jamali',
 'khabar_daneshjoo':'@Daneshjoo_adm',
 'university_pamphlet':'@tablighat_akhbar_daneshjoe',
 'pnuamol':'@ArmanMohammadi1',
 'amozesh_daneshjo':'@Ad_daneshjoyan',
 'ub_link_mv_mv_mv_mv':'@Tb_twwetylink',
 'guilan_ostad':'@GUNreports_Ads',
 'azad_tarefe':'@uni_admin','tabligh_danesh':'@amin67_h',
 'taarefe_uni':'','tnbshopbot':'',
 'tweet_mahart':'@tweet_mahart','nitteachers':'@NoshirvaniADS',
 'nittw':'@NoshirvaniADS','iusttw':'@IUST_adsbot','kutplus':'@Kutads',
 'yazd_tweet':'@yazduni_tweet','azaadnews':'@azaad_ads',
 'iaun_help':'@Azaad_ads','th_shomal':'@Azaad_ads','vadana_iau':'@Azaad_ads',
}

REJECT = {
 'eskannews_com':'خبر عمومی؛ تناسب مستقیم با مخاطب دانشجویی مشخص نیست',
 'khayyamnameh':'خبر محلی عمومی؛ مخاطب دانشگاهی مشخص نیست',
 'rashtnews':'خبر محلی عمومی؛ مخاطب دانشگاهی مشخص نیست',
 'akhbarmashhad':'رسانه عمومی شهری؛ برای فهرست هدفمند دانشگاهی کنار گذاشته شد',
 'akhbar_sob':'رسانه عمومی استانی؛ مخاطب دانشجویی مشخص نیست',
 'akhbarboushehr':'رسانه عمومی استانی؛ مخاطب دانشجویی مشخص نیست',
 'semnan_channel':'رسانه عمومی شهری؛ مخاطب دانشجویی مشخص نیست',
 'irna_1313':'خبرگزاری عمومی؛ مخاطب دانشگاهی مشخص نیست',
 'bazarehamedan':'نیازمندی عمومی شهری؛ تناسب دانشگاهی تأیید نشد',
 'tebebooali':'طب سنتی؛ ارتباطی با دانشگاه بوعلی سینا ندارد',
 'banovan_ads':'آرشیو تبلیغات عمومی؛ رسانه دانشگاهی نیست',
 'lahijun':'آرشیو تبلیغات شهری؛ رسانه دانشگاهی نیست',
 'pajouheshsarabehshahr':'پژوهش سرای دانش آموزی؛ خارج از مخاطب دانشگاهی',
 'entekhabatsenfi9':'کانال موقت انتخابات صنفی؛ جایگاه تبلیغ تجاری نیست',
 'pg u_chat':'نام و هویت نامرتبط',
 'pgu_chat':'گروه سه نفره با عنوان روسی؛ با دانشگاه خلیج فارس تطبیق ندارد',
 'kanoonmodafean':'حقوق کارگران؛ تناسب دانشگاهی مشخص نیست',
 'mohagheghabzar':'آیدی فعلی فقط ۲۴ عضو و بدون شرح؛ با عنوان سابق تطبیق نشد',
 'cafe_mostaghel':'صفحه عمومی کانال یا گروه موجود نیست',
 'tnbshopbot':'ربات است؛ رسانه یا گروه مستقل نیست',
 'madani8rezi':'گروه یازده نفره یک کلاس؛ سرنخ عمومی تبلیغات نیست',
 'liberalartsshahrekord':'۲۲ عضو و بدون شرح؛ مخاطب و کاربری تأیید نشد',
 'classmate_au':'۱۲ عضو و بدون اطلاعات تماس؛ تناسب فعلی نامشخص',
 'edufarhangian':'۸۰ عضو؛ خدمات منابع انسانی، تناسب دانشگاهی روشن نیست',
 'fastera63':'ویترین خدمات یک ارائه دهنده؛ پذیرش تبلیغ اعلام نشده',
 'younesshokrkhah':'کانال شخصی استاد؛ راه تبلیغ اعلام نشده',
 'shahroodstudent':'تابلوی رسمی دانشکده؛ مسیر اطلاع رسانی اداری است',
 'sku_ict':'پشتیبانی سامانه فناوری اطلاعات؛ جایگاه تبلیغ تجاری نیست',
 'usb_education':'صرفاً امور آموزشی؛ مسیر تجاری مشخص نیست',
 'edubirjanduniversity':'مدیریت آموزشی رسمی؛ مسیر تجاری مشخص نیست',
 'edu_uma':'معاونت آموزشی رسمی؛ مسیر تجاری مشخص نیست',
 'infosaorgir':'حساب رسمی نهاد دولتی؛ جایگاه تبلیغ تجاری اعلام نشده',
 'bsubirjand':'تشکل سیاسی و مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'basijsbu':'تشکل سیاسی و مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'basijbuali':'تشکل سیاسی و مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'basijznu':'تشکل سیاسی و مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'basijumsu':'تشکل سیاسی و مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'basijaraku':'تشکل سیاسی و مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'basij_ilam':'تشکل سیاسی و مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'hamdaman_uma':'هیئت مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'saghalain_bums':'محتوای فرهنگی و مذهبی؛ مسیر تبلیغ تجاری اعلام نشده',
 'jad_qazvin':'تشکل سیاسی؛ مسیر تبلیغ تجاری اعلام نشده',
 'jad_usb':'تشکل سیاسی؛ مسیر تبلیغ تجاری اعلام نشده',
 'anjoman_eslami_ikiu':'تشکل سیاسی؛ مسیر تبلیغ تجاری اعلام نشده',
 'scu_anjoman':'تشکل سیاسی؛ مسیر تبلیغ تجاری اعلام نشده',
 'iahums_ir':'تشکل سیاسی؛ مسیر تبلیغ تجاری اعلام نشده',
 'isy_ir':'تشکل سیاسی؛ مسیر تبلیغ تجاری اعلام نشده',
}
BLOCKED_ADS = {'znu1353','zehn_ara_psychology_group','reshte_hoghogh_elahiat',
 'reshte_hesabdari_modiryat','salatin_he','ui_arshad','uni_chb_gap',
 'student_research_committeee','pajoohehgroup'}
NETWORKS = {'ads_sut','ads_danshjo','tablighatgostardeee','azad_tarefe','taarefe_uni','tabligh_danesh'}
NATIONAL = {'azadtnb1','iauamozeshyar','daneshjo_report','daneshjoo','twitterjoo',
 'daneshjoeiiii','azadtnb_gp','amozesh_daneshjo','khabar_daneshjoo',
 'ketabkhaneh_daneshjoyan','university_pamphlet','pnudaneshjuynews','pnuvlib','azaadnews','jozvedaneshgahi_ir','vadana_iau','tweet_mahart',
 'pnuk_01','pnudaneshjuy','akhbar_pnu','linkdoni_payamnoor'}
PROJECTS = {'projectt_daneshjoo','prodessite','jobido','home_proje','prozhebegir_ir',
 'daneshju_tel2','porozhehyab','agahiadmini58','project_board','prozhe_pazhoh',
 'daneshjooprojectgroup','uni_projectss','parscoderscom','niazmandi_daneshjoii_sem'}
RESEARCH = {'mastertest','phdtest','heiatelmi','maghalehnevisi','raveshtahghighh',
 'apply_research','accept_irr','article_lab','resanehresearch','phdhi'}
TEACHERS = {'ltmssoal','edultms','ltms118','channelfarhangiyan'}
SPECIAL = {'psy_work','closeup_psychology','honare_tamarkoz','kargahh_ravan','psychefiles',
 'hoghoogh_uni_azad','book_hoghogh','elmi_hoghoogh_mly','artdoc','architectca','architectnorth',
 'civilejra_group','boomiliarc','civil_arch','hesabdari_daneshjo','noandishanhesabdari',
 'hesabdaridahom','medicall_students','medicalservic','medicine_stu','medtweeet',
 'civilejra','civilx','civiltv','sazehcal','iemtwitter','iepnu','ieproject','industrialchannel',
 'ie_apply','clubi','iedep','iiie_ir','controlengineers','industrialengineeringapply','devtwitter','pooyataraz_pishtaz'}

def contact(r):
    key = r['username'].lower()
    desc = r.get('description','')
    lines = desc.splitlines()
    terms = r'تبلیغ|تبليغ|ثبت آگهی|ارسال آگهی|ارسال آگهي|درج اگهی|درج آگهی|ثبت درخواست|تعرفه|آگهی:'
    evidence = ''
    candidates = []
    for i,line in enumerate(lines):
        if re.search(terms,line):
            # Include preceding line for contact-before-role bios, then next lines.
            block = '\n'.join(lines[i:i+4])
            hs = handles(block)
            if hs:
                candidates.extend(hs)
            if not evidence:
                evidence = block
    if key in CONTACTS:
        answer = CONTACTS[key]
    else:
        answer = candidates[0] if candidates else ''
    if not answer:
        for i,line in enumerate(lines):
            if re.search(r'ادمین|ارتباط با|پشتیبانی|روابط عمومی|ارتباط و',line):
                hs = handles('\n'.join(lines[i:i+3]))
                if hs:
                    answer = hs[0]
                    if not evidence:
                        evidence = '\n'.join(lines[i:i+3])
                    break
    if key in CONTACTS:
        answer = CONTACTS[key]
    # If an explicit chosen handle exists, show its actual local bio context.
    if answer:
        needle = answer.removeprefix('@').split('/')[-1].split('?')[0]
        matches=[]
        for i,line in enumerate(lines):
            if re.search(r'(?<![A-Za-z0-9_])'+re.escape(needle)+r'(?![A-Za-z0-9_])',line,re.I):
                matches.append('\n'.join(lines[max(0,i-3):i+2]))
        if matches:evidence=next((m for m in matches if re.search(terms,m)),matches[-1])
    return answer, ' '.join(evidence.split())[:260]

def geography(r):
    key=r['username'].lower()
    known={'newstnb':'تهران','srbtwitter':'تهران','s_daneshju':'سراسری',
     'guilan_ostad':'گیلان','gu_ent':'گیلان','tnbshop':'تهران',
     'eeaut':'تهران','qiaulink':'قزوین','rashtportal':'گیلان',
     'generalplus_yu':'یزد','ravan_khu':'تهران / البرز',
     'farhangiedu':'تهران','nsa_iums':'تهران'}
    known.update({'nittw':'مازندران','nitteachers':'مازندران','iusttw':'تهران',
     'sut_tweet':'آذربایجان شرقی','twitter_alzahra':'تهران','ctb_uni':'تهران',
     'usctw':'تهران','sbu prof':'تهران','sbuprof':'تهران','sharif_ie':'تهران',
     'ece_iut':'اصفهان','sut_community':'نامشخص','hamyarut':'تهران',
     'ashenaee_ba_asatid':'خراسان رضوی','iaun_help':'اصفهان','gorgan_uni':'گلستان'})
    if key in known:return known[key]
    if key in NATIONAL|NETWORKS|PROJECTS|RESEARCH|TEACHERS|SPECIAL:
        return 'سراسری'
    text=norm(r.get('title','')+' '+r.get('description',''))
    mapping=[('تبریز','آذربایجان شرقی'),('شهید مدنی','آذربایجان شرقی'),('ارومیه','آذربایجان غربی'),
      ('کردستان','کردستان'),('کرمانشاه','کرمانشاه'),('رازی','کرمانشاه'),
      ('بوعلی','همدان'),('ملایر','همدان'),('همدان','همدان'),('کرج','البرز'),('خوارزمی','تهران / البرز'),
      ('تهران','تهران'),('شریف','تهران'),('بهشتی','تهران'),('علم و صنعت','تهران'),('علموصنعت','تهران'),('علامه','تهران'),
      ('گیلان','گیلان'),('رشت','گیلان'),('لاهیجان','گیلان'),('شیراز','فارس'),('فسا','فارس'),
      ('فردوسی','خراسان رضوی'),('مشهد','خراسان رضوی'),('نیشابور','خراسان رضوی'),
      ('اراک','مرکزی'),('قزوین','قزوین'),('اصفهان','اصفهان'),('کاشان','اصفهان'),
      ('مازندران','مازندران'),('آمل','مازندران'),('بابل','مازندران'),('یزد','یزد'),('زنجان','زنجان'),
      ('کرمان','کرمان'),('چمران','خوزستان'),('اهواز','خوزستان'),
      ('سمنان','سمنان'),('شاهرود','سمنان'),('بیرجند','خراسان جنوبی'),
      ('سیستان','سیستان و بلوچستان'),('خلیج فارس','بوشهر'),('بوشهر','بوشهر'),
      ('هرمزگان','هرمزگان'),('قم','قم'),('اردبیل','اردبیل'),('لرستان','لرستان'),
      ('شهرکرد','چهارمحال و بختیاری'),('ایلام','ایلام'),('یاسوج','کهگیلویه و بویراحمد'),
      ('بجنورد','خراسان شمالی'),('گلستان','گلستان')]
    for term,area in mapping:
        if term in text:return area
    q=r.get('discovery_query','')
    presets={
     'uniSearch':['تهران','تهران','تهران','گیلان','یزد','همدان','کرمانشاه','خوزستان'],
     'regionalSearch':['مازندران','زنجان','آذربایجان غربی','مرکزی','قزوین','تهران / البرز','البرز','تهران'],
     'provinceSearch':['سمنان','خراسان جنوبی','سیستان و بلوچستان','بوشهر','هرمزگان','اصفهان','قم','اردبیل'],
     'moreProvince':['لرستان','چهارمحال و بختیاری','ایلام','کهگیلویه و بویراحمد','خراسان شمالی','گلستان','تهران','تهران'],
    }
    for pre,arr in presets.items():
        if q.startswith(pre): return arr[int(q[len(pre):])]
    return 'نامشخص'

def prepare(r):
    key=r['username'].lower()
    desc=r.get('description','')
    text=norm(desc)
    c,evidence=contact(r)
    geo=geography(r)
    members=number(r.get('extra',''))
    explicit=bool(re.search(r'تبلیغ|تبليغ|تبليغات|ثبت آگهی|ارسال آگهی|ارسال آگهي|درج آگهی|درج اگهی|ثبت درخواست|آگهی:',desc))
    last=r.get('latest_visible_post')
    age=(TODAY-dt.date.fromisoformat(last[:10])).days if last else None
    official=bool(re.search(r'معاونت|کمیته تحقیقات|روابط عمومی دانشگاه|شورای صنفی|انجمن علمی|انجمن های علمی|کانون های فرهنگی',text))
    status='پذیرش تبلیغ نامشخص'
    if explicit:status='راه تبلیغ یا آگهی اعلام شده'
    if key in NETWORKS:status='مسیر شبکه یا تعرفه تبلیغات'
    if key=='parscoderscom':status='بازار پروژه؛ تبلیغ مستقیم تأیید نشده'
    if key=='pnuamol':status='درج تبلیغ برای آینده اعلام شده'
    if key=='yazduni_group':status='آگهی محدود طبق قوانین گروه'
    if key=='qomunigroup':status='صفحه راهنمای گروه؛ محدودیت تبلیغ'
    if key=='medicine_stu':status='آیدی Ad در معرفی؛ نیازمند تأیید'
    if key=='psy_work':status='ثبت کارگاه؛ پذیرش خدمات ما نامشخص'
    if key=='csrazi':status='پذیرش تبلیغ نامشخص؛ منع تبلیغ در کامنت'
    if key=='sedayedaneshjoo_lu':status='تبلیغ از ربات پین؛ ادمین عمومی ثبت شده'
    if key=='tribon_channel':status='هشتگ تبلیغات؛ تماس عمومی ثبت شده'
    if key=='tnbshop':status='آگهی کتاب و کالا؛ خدمات ما استعلام شود'
    if key in {'hesabdari_daneshjo','kooye_daneshgah1313','iustgp','azadtnb_gp'}:
        status='فقط هماهنگی با مسئول تبلیغات'
    if key in {'architectnorth','karajunione'}:
        status='تبلیغ بدون هماهنگی ممنوع؛ تماس اعلام نشده'
    reason=REJECT.get(key,'')
    if key in BLOCKED_ADS:
        reason='تبلیغات در معرفی ممنوع یا صریحاً رد شده'
        status='تبلیغ ممنوع / پذیرفته نمی شود'
    if r.get('kind')=='other' and not reason:reason='کانال یا گروه عمومی با شمار اعضا تأیید نشد'
    if key in NETWORKS:segment='شبکه تبلیغات و تعرفه'
    elif key in PROJECTS:segment='بازار پروژه و فریلنسری'
    elif key in RESEARCH:segment='پژوهش و تحصیلات تکمیلی'
    elif key in TEACHERS:segment='فرهنگیان و آموزش'
    elif key in SPECIAL:segment='رشته ای و تخصصی'
    elif key in NATIONAL:segment='دانشجویی سراسری و پیام نور'
    elif official:segment='انجمن و رسانه رسمی دانشگاه'
    else:segment='رسانه و گروه دانشگاهی'
    fresh='فعالیت گروه بررسی نشده' if r.get('kind')=='group' else 'پیش نمایش عمومی در دسترس نیست'
    if age is not None:
        fresh='پست تا ۳۰ روز اخیر' if age<=30 else 'پست بین ۳۱ تا ۱۸۰ روز' if age<=180 else 'آخرین پست بیش از ۱۸۰ روز'
    # Contact exists is distinct from acceptance; no general admin is promoted
    # to an ad contact unless the bio explicitly supports that role.
    direct=explicit and bool(c) and (age is None or age<=180)
    if key in {'medicine_stu','psy_work','tnbshop','pnuamol','qomunigroup','architectnorth','karajunione','zu_tweet','csrazi','tribon_channel','sedayedaneshjoo_lu'}:
        direct=False
    if members is not None and members<200:direct=False
    bucket='کنارگذاشته' if reason else 'استعلام تبلیغ' if direct else 'نیازمند بررسی'
    if bucket=='کنارگذاشته':next_action=reason
    elif bucket=='استعلام تبلیغ':next_action='استعلام پذیرش متن دانشیار، تعرفه و نمونه تبلیغ مشابه'
    elif official:next_action='بررسی امکان معرفی خدمت یا همکاری آموزشی با مسئول رسانه'
    elif c:next_action='پرسش درباره پذیرش تبلیغ و مسئول هماهنگی'
    else:next_action='پیداکردن راه تماس از پست پین یا رسانه مادر'
    notes=[]
    if official and not explicit:notes.append('رسمی/انجمنی؛ پذیرش تبلیغ تجاری اعلام نشده')
    if c and not explicit:notes.append('تماس عمومی است؛ مسئول تبلیغات تأیید نشده')
    if r.get('kind')=='group':notes.append('فقط معرفی عمومی بررسی شد؛ محتوای داخل گروه بررسی نشده')
    if age is not None and age>180:notes.append('پیش از هر اقدام، فعالیت فعلی تأیید شود')
    if key in {'maghalehnevisi','raveshtahghighh','apply_research'}:notes.append('پذیرش نوع دقیق خدمت دانشیار باید جدا استعلام شود')
    if key in NETWORKS:notes.append('واسطه/تعرفه است؛ تعداد اعضای آن، اندازه مخاطب کمپین نیست')
    if key=='parscoderscom':notes.append('مسیر ثبت/پیشنهاد پروژه از سایت است؛ تعرفه تبلیغ تلگرامی معلوم نیست')
    if key=='yazduni_group':notes.append('طبق معرفی: آگهی هفته ای یک بار، دو خطی و ارجاع به بیو')
    if key=='tnbshop':notes.append('تماس از معرفی خود کانال؛ تمرکز فعلی فروش کتاب و کالا')
    if r.get('discovery_query')=='public-network-list':notes.append('در فهرست علنی یک شبکه تبلیغاتی دیده شد؛ همکاری فعلی با شبکه تأیید نشده')
    service='ارائه و پاورپوینت، پشتیبانی پژوهشی'
    if segment=='بازار پروژه و فریلنسری':service='آگهی خدمات ارائه، تایپ و ویرایش، پروژه'
    elif segment=='پژوهش و تحصیلات تکمیلی':service='روش تحقیق، ویرایش، ارائه دفاع'
    elif segment=='فرهنگیان و آموزش':service='ارائه آموزشی و تنظیم گزارش'
    elif 'حقوق' in text or 'حقوق' in r.get('title',''):service='ارائه حقوقی و ویرایش پژوهش حقوق'
    elif 'معمار' in text or 'عمران' in text:service='ارائه معماری/عمران و تنظیم گزارش'
    elif 'روان' in text:service='ارائه و ویرایش پژوهش روانشناسی'
    elif 'پزشک' in text or 'پرستار' in text:service='ارائه علمی، تنظیم گزارش و پوستر'
    if key=='ads_sut':evidence='راه ارتباطی: @sut_tw_admin؛ تعرفه تبلیغات SUT Twitter'
    return dict(username=r['username'],title=r.get('title','').replace('\n',' '),
      url=r['url'],kind=r.get('kind'),segment=segment,geography=geo,members=members,
      advertising_status=status,contact=c,contact_url=('https://t.me/'+c[1:] if c.startswith('@') else c if c.startswith('http') else ''),
      latest_visible_post=last[:10] if last else None,activity=fresh,
      bucket=bucket,next_action=next_action,suitable_services=service,
      notes='؛ '.join(notes),exclusion_reason=reason,
      source_url='https://t.me/ads_sut/9' if key=='ads_sut' else r['url'],contact_evidence=evidence,checked_on='2026-11-10',
      discovery_url=r.get('discovery_url'),discovery_query=r.get('discovery_query'),
      # Internal assessment is categorical, not an invented numerical score.
      priority='استعلام مستقیم' if direct else 'همکاری/استعلام' if c else 'یافتن تماس')

def main():
    raw=json.loads((OUT/'public-profiles.json').read_text(encoding='utf-8'))
    records=[prepare(r) for r in raw]
    # Keep a shared-contact network label only when a public route matches.
    contacts=collections.Counter(r['contact'].lower() for r in records if r['contact'] and r['bucket']!='کنارگذاشته')
    for r in records:
        r['shared_contact']=r['contact'] if contacts[r['contact'].lower()]>1 else ''
    records.sort(key=lambda r:({'استعلام تبلیغ':0,'نیازمند بررسی':1,'کنارگذاشته':2}[r['bucket']],
      {'بازار پروژه و فریلنسری':0,'پژوهش و تحصیلات تکمیلی':1,'رسانه و گروه دانشگاهی':2,
       'رشته ای و تخصصی':3,'دانشجویی سراسری و پیام نور':4,'شبکه تبلیغات و تعرفه':5,
       'فرهنگیان و آموزش':6,'انجمن و رسانه رسمی دانشگاه':7}[r['segment']],-(r['members'] or 0)))
    for i,r in enumerate(records,1):r['id']=i
    counts=dict(collections.Counter(r['bucket'] for r in records))
    pack={'as_of':'2026-11-10','method':'Public Telegram profiles and latest public previews; no joins or messages. Public ad routing is not acceptance of Daneshyar or a performance endorsement.',
     'counts':counts,'total_screened':len(records),'records':records}
    (OUT/'advertising-directory.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'counts':counts,'segments':dict(collections.Counter(r['segment'] for r in records if r['bucket']!='کنارگذاشته'))},ensure_ascii=False))
    for r in records:
        if r['discovery_query']=='public-network-list' and r['bucket']=='استعلام تبلیغ':
            print(r['username'],'|',r['contact'],'|',r['contact_evidence'])

if __name__=='__main__':main()
