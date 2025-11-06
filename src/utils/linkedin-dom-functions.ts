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
  const messageItems = document.querySelectorAll('.msg-s-message-list__event');
  
  messageItems.forEach((item) => {
    const messageEl = item.querySelector('.msg-s-event-listitem__message-bubble p');
    const message = messageEl?.textContent?.trim() || '';
    
    const senderEl = item.querySelector('.msg-s-message-group__name');
    const sender = senderEl?.textContent?.trim() || '';
    
    const timestampEl = item.querySelector('.msg-s-message-group__timestamp');
    const timestamp = timestampEl?.textContent?.trim() || '';
    
    if (message) {
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
