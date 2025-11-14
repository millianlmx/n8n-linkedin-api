/**
 * LinkedIn DOM Extraction Functions
 * 
 * These functions are designed to run in the browser context via page.evaluate()
 * They are extracted here to make them unit-testable with jsdom
 */

// ============================================================================
// PROFILE SCRAPING FUNCTIONS
// ============================================================================

export function extractProfileData() {
  // Helper function to find sections by their anchor ID
  const getSectionByAnchor = (anchorId: string) => {
    const anchor = document.querySelector(`div#${anchorId}`);
    return anchor?.closest('section') || null;
  };

  const getName = () => {
    const nameEl = document.querySelector('h1.t-24.v-align-middle.break-words');
    return nameEl?.textContent?.trim() || '';
  };

  const getTitle = () => {
    const titleEl = document.querySelector('div.text-body-medium[data-generated-suggestion-target]');
    return titleEl?.textContent?.trim() || '';
  };

  const getLocation = () => {
    const locationEl = document.querySelector('span.text-body-small.inline.t-black--light.break-words');
    return locationEl?.textContent?.trim() || '';
  };

  const getConnectionCount = () => {
    const countEl = document.querySelector('li.text-body-small a[href*="connectionOf"]');
    return countEl?.textContent?.trim().replace(/\s+/g, ' ') || '';
  };

  const getProfileImage = () => {
    const imgEl = document.querySelector('img.pv-top-card-profile-picture__image--show') as HTMLImageElement;
    return imgEl?.src || '';
  };

  const getBackgroundImage = () => {
    const bgEl = document.querySelector('#profile-background-image-target-image') as HTMLImageElement;
    return bgEl?.src || '';
  };

  const getAbout = () => {
    const aboutSection = getSectionByAnchor('about');
    if (!aboutSection) return '';
    const aboutText = aboutSection.querySelector('div[class*=\'inline-show-more-text\'] > span[aria-hidden=\'true\']');
    return aboutText?.textContent?.trim() || '';
  };

  const getEducation = () => {
    const education: any[] = [];
    const educationSection = getSectionByAnchor('education');
    if (!educationSection) return education;
    
    const eduItems = educationSection.querySelectorAll('ul > li.artdeco-list__item');
    
    eduItems.forEach((item) => {
      const schoolEl = item.querySelector('div.display-flex.align-items-center.mr1.hoverable-link-text.t-bold > span[aria-hidden="true"]');
      const school = schoolEl?.textContent?.trim() || '';
      if (!school) return;
      
      const degreeEl = item.querySelector('span.t-14.t-normal > span[aria-hidden="true"]');
      const degreeAndField = degreeEl?.textContent?.trim() || '';
      
      const datesEl = item.querySelector('span.t-14.t-normal.t-black--light > span[aria-hidden="true"]');
      const dates = datesEl?.textContent?.trim() || '';
      
      education.push({
        school,
        degree: degreeAndField,
        dates
      });
    });
    
    return education;
  };

  const getExperience = () => {
    const experience: any[] = [];
    const experienceSection = getSectionByAnchor('experience');
    if (!experienceSection) return experience;
    
    const expItems = experienceSection.querySelectorAll('ul > li.artdeco-list__item');
    
    expItems.forEach((item) => {
      const titleEl = item.querySelector('div.display-flex.align-items-center.mr1.t-bold > span[aria-hidden="true"]');
      const title = titleEl?.textContent?.trim() || '';
      if (!title) return;
      
      const companyEl = item.querySelector('span.t-14.t-normal > span[aria-hidden="true"]');
      const company = companyEl?.textContent?.trim() || '';
      
      const datesEl = item.querySelector('span.t-14.t-normal.t-black--light > span[aria-hidden="true"]');
      const dates = datesEl?.textContent?.trim() || '';
      
      const locationEl = item.querySelector('span.t-14.t-normal.t-black--light:nth-child(2) > span[aria-hidden="true"]');
      const location = locationEl?.textContent?.trim() || '';
      
      experience.push({
        title,
        company,
        dates,
        location
      });
    });
    
    return experience;
  };

  const getSkills = () => {
    const skills: string[] = [];
    const skillsSection = getSectionByAnchor('skills');
    if (!skillsSection) return skills;
    
    const skillItems = skillsSection.querySelectorAll('div.display-flex.align-items-center.mr1.hoverable-link-text.t-bold > span[aria-hidden="true"]');
    
    skillItems.forEach((item) => {
      const skill = item.textContent?.trim();
      if (skill) skills.push(skill);
    });
    
    return skills;
  };

  // Return all extracted data
  return {
    name: getName(),
    title: getTitle(),
    location: getLocation(),
    connections: getConnectionCount(),
    profileImage: getProfileImage(),
    backgroundImage: getBackgroundImage(),
    about: getAbout(),
    education: getEducation(),
    experience: getExperience(),
    skills: getSkills()
  };
}

// ============================================================================
// CONVERSATION FUNCTIONS
// ============================================================================

export function extractConversationsList() {
  const convItems = document.querySelectorAll('li.msg-conversation-listitem');
  const results: any[] = [];

  convItems.forEach((item: Element, index: number) => {
    const nameEl = item.querySelector('.msg-conversation-card__participant-names .truncate');
    const name = nameEl?.textContent?.trim() || '';
    
    const snippetEl = item.querySelector('.msg-conversation-card__message-snippet');
    const lastMessageText = snippetEl?.textContent?.trim() || '';
    
    // Detect who sent the last message
    const sentByYou = lastMessageText.startsWith('Vous :') || 
                     lastMessageText.startsWith('Vous\u00A0:') ||
                     lastMessageText.includes('Vous&nbsp;:');
    
    const timeEl = item.querySelector('time.msg-conversation-card__time-stamp');
    const timestamp = timeEl?.textContent?.trim() || '';
    
    const unreadBadge = item.querySelector('.msg-conversation-card__unread-count');
    const isUnread = !!unreadBadge;
    
    if (nameEl) {
      results.push({
        index,
        name,
        lastMessage: lastMessageText,
        lastMessageSentByYou: sentByYou,
        timestamp,
        url: '', // Will be filled by clicking
        isUnread
      });
    }
  });

  return results;
}

export function extractUnreadConversations() {
  const convItems = document.querySelectorAll('li.msg-conversation-listitem');
  const unread: any[] = [];

  convItems.forEach((item: Element, index: number) => {
    const unreadBadge = item.querySelector('.msg-conversation-card__unread-count');
    if (!unreadBadge) return;
    
    const nameEl = item.querySelector('.msg-conversation-card__participant-names .truncate');
    const name = nameEl?.textContent?.trim() || '';
    
    const lastMessageEl = item.querySelector('.msg-conversation-card__message-snippet-body');
    const lastMessage = lastMessageEl?.textContent?.trim() || '';
    
    const timestampEl = item.querySelector('.msg-conversation-card__time-stamp');
    const timestamp = timestampEl?.textContent?.trim() || '';
    
    const unreadCount = unreadBadge.textContent?.trim() || '1';
    
    unread.push({
      name,
      lastMessage,
      timestamp,
      unreadCount,
      index
    });
  });

  return unread;
}

export function extractConversationMessages() {
  const messages: any[] = [];
  const messageListItems = document.querySelectorAll('.msg-s-message-list__event');
  
  // Helper function to convert relative dates to actual dates
  const convertRelativeDate = (dateStr: string): string => {
    const normalized = dateStr.trim().toLowerCase();
    
    // Check for "Today" in various languages
    if (normalized === "aujourd'hui" || normalized === 'today' || normalized === 'hoy') {
      const today = new Date();
      return formatDate(today);
    }
    
    // Check for "Yesterday" in various languages
    if (normalized === 'hier' || normalized === 'yesterday' || normalized === 'ayer') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return formatDate(yesterday);
    }
    
    // Check for weekday names (French, English, Spanish)
    const weekdays = {
      // French
      'lundi': 1, 'mardi': 2, 'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6, 'dimanche': 0,
      // English
      'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6, 'sunday': 0,
      // Spanish
      'lunes': 1, 'martes': 2, 'miércoles': 3, 'jueves': 4, 'viernes': 5, 'sábado': 6, 'domingo': 0
    };
    
    const targetDay = weekdays[normalized as keyof typeof weekdays];
    if (targetDay !== undefined) {
      const today = new Date();
      const currentDay = today.getDay();
      
      // Calculate days difference (going backwards in time)
      let daysDiff = currentDay - targetDay;
      if (daysDiff <= 0) {
        // If target day is today or in the future, go back a week
        daysDiff += 7;
      }
      
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() - daysDiff);
      return formatDate(targetDate);
    }
    
    // Return original if not a relative date
    return dateStr;
  };
  
  // Helper function to format date as "29 oct."
  const formatDate = (date: Date): string => {
    const months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 
                    'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    const day = date.getDate();
    const month = months[date.getMonth()];
    return `${day} ${month}`;
  };
  
  let currentDay = '';
  
  messageListItems.forEach((item) => {
    // Check if this item contains a day heading
    const dayHeadingEl = item.querySelector('.msg-s-message-list__time-heading');
    if (dayHeadingEl) {
      const rawDay = dayHeadingEl.textContent?.trim() || '';
      currentDay = convertRelativeDate(rawDay);
    }
    
    // Extract message content
    const messageEl = item.querySelector('.msg-s-event-listitem__message-bubble p');
    const message = messageEl?.textContent?.trim() || '';
    
    const senderEl = item.querySelector('.msg-s-message-group__name');
    const sender = senderEl?.textContent?.trim() || '';
    
    const timeEl = item.querySelector('.msg-s-message-group__timestamp');
    const time = timeEl?.textContent?.trim() || '';
    
    if (message) {
      // Combine day and time for full timestamp
      const timestamp = currentDay ? `${currentDay} ${time}` : time;
      
      messages.push({
        sender,
        message,
        timestamp
      });
    }
  });
  
  return messages;
}

// ============================================================================
// CONNECTION REQUEST FUNCTIONS
// ============================================================================

export function checkConnectionDegree() {
  const degreeEl = document.querySelector('.dist-value');
  return !!degreeEl;
}

export function clickConnectButton() {
  const buttons = Array.from(document.querySelectorAll('button'));
  for (const button of buttons) {
    const ariaLabel = button.getAttribute('aria-label');
    const text = button.textContent?.trim();
    if (ariaLabel?.includes('Connect') || ariaLabel?.includes('Inviter') || 
        text?.includes('Connect') || text?.includes('Se connecter')) {
      button.click();
      return true;
    }
  }
  return false;
}

export function checkAddNoteButton() {
  const modal = document.querySelector('#artdeco-modal-outlet');
  if (!modal) return false;
  
  const buttons = Array.from(modal.querySelectorAll('button'));
  for (const button of buttons) {
    const text = button.textContent?.trim();
    if (text?.includes('Add a note') || text?.includes('Ajouter une note')) {
      return true;
    }
  }
  return false;
}

export function clickAddNoteButton() {
  const modal = document.querySelector('#artdeco-modal-outlet');
  if (!modal) return false;
  
  const buttons = Array.from(modal.querySelectorAll('button'));
  for (const button of buttons) {
    const text = button.textContent?.trim();
    if (text?.includes('Add a note') || text?.includes('Ajouter une note')) {
      button.click();
      return true;
    }
  }
  return false;
}

export function typeNoteMessage(message: string) {
  const textarea = document.querySelector('#custom-message') as HTMLTextAreaElement;
  if (textarea) {
    textarea.value = message;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}

export function clickSendInvitation() {
  const modal = document.querySelector('#artdeco-modal-outlet');
  if (!modal) return false;
  
  const buttons = Array.from(modal.querySelectorAll('button'));
  for (const button of buttons) {
    const ariaLabel = button.getAttribute('aria-label');
    const text = button.textContent?.trim();
    if (ariaLabel?.includes('Send') || ariaLabel?.includes('Envoyer') ||
        text?.includes('Send') || text?.includes('Envoyer')) {
      button.click();
      return true;
    }
  }
  return false;
}

// ============================================================================
// PROFILE VIEWS FUNCTIONS
// ============================================================================

export function extractProfileViews() {
  const nameEl = document.querySelector('h1.text-heading-xlarge');
  const name = nameEl?.textContent?.trim() || '';
  
  const titleEl = document.querySelector('.text-body-medium.break-words');
  const title = titleEl?.textContent?.trim() || '';
  
  const viewsEl = document.querySelector('.pvs-header__subtitle');
  const viewsText = viewsEl?.textContent?.trim() || '';
  
  const views = parseInt(viewsText.match(/\d+/)?.[0] || '0');
  
  return {
    name,
    title,
    views,
    viewsText
  };
}

// ============================================================================
// SEARCH FUNCTIONS
// ============================================================================

export function extractSearchResults() {
  const results: any[] = [];
  const resultItems = document.querySelectorAll('.reusable-search__result-container');
  
  resultItems.forEach((item) => {
    const nameEl = item.querySelector('.entity-result__title-text a span[aria-hidden="true"]');
    const name = nameEl?.textContent?.trim() || '';
    
    const titleEl = item.querySelector('.entity-result__primary-subtitle');
    const title = titleEl?.textContent?.trim() || '';
    
    const locationEl = item.querySelector('.entity-result__secondary-subtitle');
    const location = locationEl?.textContent?.trim() || '';
    
    const linkEl = item.querySelector('.entity-result__title-text a') as HTMLAnchorElement;
    const profileUrl = linkEl?.href || '';
    
    if (name && profileUrl) {
      results.push({
        name,
        title,
        location,
        profileUrl
      });
    }
  });
  
  return results;
}

export function scrollSearchResults() {
  const resultsContainer = document.querySelector('.search-results-container');
  if (resultsContainer) {
    resultsContainer.scrollTop = resultsContainer.scrollHeight;
    return true;
  }
  return false;
}

// ============================================================================
// MESSAGE SENDING FUNCTIONS
// ============================================================================

export function clickConversationItem(index: number) {
  const convItems = document.querySelectorAll('li.msg-conversation-listitem');
  const item = convItems[index];
  if (item) {
    const linkEl = item.querySelector('.msg-conversation-listitem__link') as HTMLElement;
    if (linkEl) {
      linkEl.click();
      return true;
    }
  }
  return false;
}

// ============================================================================
// CONNECTION STATUS FUNCTIONS
// ============================================================================

export function checkConnectionStatus() {
  console.log('--- Checking Connection Status ---');

  // First, check if we're on a login page or modal
  const passwordField = document.querySelector('input[type="password"]');
  const loginForm = document.querySelector('form[data-id="sign-in-form"]');
  const languageSelector = document.querySelector('button[aria-label*="العربية"]') || 
                          document.querySelector('button[aria-label*="English"]');
  
  if (passwordField || loginForm || languageSelector) {
    console.log('❌ ERROR: Detected login page or authentication modal!');
    console.log('   Password field:', !!passwordField);
    console.log('   Login form:', !!loginForm);
    console.log('   Language selector:', !!languageSelector);
    console.log('   Current URL:', window.location.href);
    return { status: 'not_authenticated', connected: false };
  }

  // Debug: Log all buttons with their aria-labels to understand what's available
  const allButtons = Array.from(document.querySelectorAll('button'));
  console.log(`Found ${allButtons.length} total buttons on page`);
  
  const buttonsWithAriaLabel = allButtons
    .filter(btn => btn.getAttribute('aria-label'))
    .map(btn => ({
      label: btn.getAttribute('aria-label'),
      text: btn.textContent?.trim().substring(0, 50) // First 50 chars
    }));
  
  console.log('Buttons with aria-label:', JSON.stringify(buttonsWithAriaLabel, null, 2));

  // Check for 1st degree connection via degree badge
  // Try multiple selectors as LinkedIn's DOM structure varies
  const degreeEl = document.querySelector('.distance-badge .dist-value') || 
                   document.querySelector('.dist-value') ||
                   document.querySelector('[class*="dist-value"]');
  const degreeText = degreeEl?.textContent?.trim();
  console.log('Degree element found:', !!degreeEl, 'Text:', degreeText);
  
  if (degreeText === '1er' || degreeText === '1st') {
    console.log('✅ Status determined: connected (1st degree)');
    return { status: 'connected', connected: true };
  }
  
  // Note: We don't check for Message button because Premium users can message anyone
  // This would give false positives for Premium accounts

  // Check for pending connection
  const pendingButton = allButtons.find(btn => {
    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
    const text = btn.textContent?.toLowerCase() || '';
    return ariaLabel.includes('pending') || 
           ariaLabel.includes('en attente') ||
           text.includes('pending') ||
           text.includes('en attente');
  });
  
  if (pendingButton) {
    console.log('⏳ Status determined: pending');
    console.log('   Button aria-label:', pendingButton.getAttribute('aria-label'));
    return { status: 'pending', connected: false };
  }

  // Check for connect button
  const connectButton = allButtons.find(btn => {
    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
    const text = btn.textContent?.toLowerCase() || '';
    return ariaLabel.includes('connect') || 
           ariaLabel.includes('inviter') ||
           ariaLabel.includes('invitez') ||
           text.includes('connect') ||
           text.includes('se connecter');
  });
  
  if (connectButton) {
    console.log('❌ Status determined: not_connected');
    console.log('   Button aria-label:', connectButton.getAttribute('aria-label'));
    return { status: 'not_connected', connected: false };
  }

  console.log('⚠️  Connection status could not be determined');
  console.log('   No matching buttons found for: message, pending, or connect');
  return { status: 'unknown', connected: false };
}

export function extractProfileName() {
  const nameEl = document.querySelector('h1.inline.t-24.v-align-middle.break-words');
  return nameEl?.textContent?.trim() || '';
}

export function findAndClickConversationByName(firstName: string, lastName: string) {
  // Normalize search terms (lowercase, trim)
  const searchFirstName = firstName.toLowerCase().trim();
  const searchLastName = lastName.toLowerCase().trim();
  const fullName = `${searchFirstName} ${searchLastName}`;
  
  // Helper function to search in current visible conversations
  const searchInVisibleConversations = () => {
    const conversationItems = Array.from(document.querySelectorAll('li.msg-conversation-listitem'));
    
    for (const item of conversationItems) {
      // Get the participant name from the conversation card
      const nameEl = item.querySelector('.msg-conversation-listitem__participant-names .truncate');
      if (!nameEl) continue;
      
      const participantName = nameEl.textContent?.trim().toLowerCase() || '';
      
      // Check if the name matches (either "firstname lastname" or "lastname firstname")
      const matchesFullName = participantName.includes(fullName);
      const matchesReversed = participantName.includes(`${searchLastName} ${searchFirstName}`);
      const matchesBoth = participantName.includes(searchFirstName) && participantName.includes(searchLastName);
      
      if (matchesFullName || matchesReversed || matchesBoth) {
        // Click on the conversation link
        const linkEl = item.querySelector('.msg-conversation-listitem__link') as HTMLElement;
        if (linkEl) {
          linkEl.click();
          return { success: true, name: nameEl.textContent?.trim() };
        }
      }
    }
    
    return null;
  };
  
  // First attempt: search in currently visible conversations
  const result = searchInVisibleConversations();
  if (result) return result;
  
  // If not found, scroll and search up to 5 times
  const conversationList = document.querySelector('.msg-conversations-container__conversations-list');
  if (!conversationList) {
    return { success: false, name: null };
  }
  
  const maxScrollAttempts = 5;
  for (let i = 0; i < maxScrollAttempts; i++) {
    // Scroll to bottom of conversation list
    conversationList.scrollTop = conversationList.scrollHeight;
    
    // Wait a bit for new conversations to load (using a simple busy wait)
    const startTime = Date.now();
    while (Date.now() - startTime < 1000) {
      // Busy wait for 1 second
    }
    
    // Search again in newly loaded conversations
    const scrollResult = searchInVisibleConversations();
    if (scrollResult) return scrollResult;
  }
  
  return { success: false, name: null };
}
