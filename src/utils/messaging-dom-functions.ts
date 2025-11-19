/**
 * DOM manipulation functions for LinkedIn messaging
 * These functions are executed in the browser context via Puppeteer
 */

export const MessagingDOMFunctions = {
  /**
   * Process unread conversations in the messaging list
   * Returns array of unread conversation data
   */
  processUnreadConversations: () => {
    const convElements = document.querySelectorAll('.msg-conversation-listitem');
    const unreadConvs: any[] = [];

    convElements.forEach((conv) => {
      const unreadBadge = conv.querySelector('.msg-conversation-card__unread-count');
      
      if (unreadBadge) {
        const nameEl = conv.querySelector('.msg-conversation-listitem__participant-names');
        const conversationCard = conv.querySelector('.msg-conversation-card');
        const conversationId = conversationCard?.id || '';
        
        if (nameEl && conversationId) {
          const liId = conv.id;
          const convData = {
            name: nameEl.textContent?.trim() || '',
            elementId: liId,
            unreadCount: unreadBadge.textContent?.trim() || '1',
          };
          unreadConvs.push(convData);
        }
      }
    });

    return unreadConvs;
  },

  /**
   * Setup MutationObserver to watch for new messages
   * Returns observer setup status
   */
  setupMessageObserver: () => {
    // Disconnect existing observer if any
    if ((window as any).messageObserver) {
      (window as any).messageObserver.disconnect();
    }

    // Set up MutationObserver to watch for changes in the conversation list
    let conversationList = document.querySelector('#main > div > div.scaffold-layout__list-detail-inner.scaffold-layout__list-detail-inner--grow > div.scaffold-layout__list.msg__list > div.relative.display-flex.justify-center.flex-column.overflow-hidden.msg-conversations-container--inbox-shortcuts > ul');
    
    if (!conversationList) {
      conversationList = document.querySelector('.msg-conversations-container__conversations-list') ||
                       document.querySelector('ul[class*="msg-conversations"]') ||
                       document.querySelector('.scaffold-layout__list ul');
    }
    
    if (conversationList) {
      const observer = new MutationObserver((mutations) => {
        let hasUnreadChanges = false;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as HTMLElement;
                if (element.querySelector?.('.msg-conversation-card__unread-count') ||
                    element.classList?.contains('msg-conversation-listitem')) {
                  hasUnreadChanges = true;
                }
              }
            });
          } else if (mutation.type === 'attributes') {
            const target = mutation.target as HTMLElement;
            if (target.classList?.contains('msg-conversation-card__unread-count') ||
                target.querySelector?.('.msg-conversation-card__unread-count')) {
              hasUnreadChanges = true;
            }
          }
          
          if (hasUnreadChanges) break;
        }

        if (hasUnreadChanges) {
          window.dispatchEvent(new CustomEvent('linkedin-new-message'));
        }
      });

      observer.observe(conversationList, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true
      });

      (window as any).messageObserver = observer;
      
      return {
        success: true,
        selector: conversationList.className || 'ul',
        elementFound: true
      };
    } else {
      return {
        success: false,
        selector: null,
        elementFound: false
      };
    }
  },

  /**
   * Click on a conversation element to open it
   * @param elementId - The ID of the conversation element
   */
  clickConversation: (elementId: string) => {
    const convElement = document.getElementById(elementId);
    if (convElement) {
      const linkEl = convElement.querySelector('.msg-conversation-listitem__link');
      if (linkEl) {
        (linkEl as HTMLElement).click();
        return true;
      }
    }
    return false;
  },

  /**
   * Extract profile URL from conversation thread detail
   * @returns Profile URL or null
   */
  extractProfileUrl: () => {
    const profileLink = document.querySelector('#thread-detail-jump-target > div > a');
    if (profileLink) {
      return profileLink.getAttribute('href');
    }
    return null;
  },

  /**
   * Setup event listener for new message events
   */
  setupMessageEventListener: () => {
    // Store handler reference for later removal if needed
    (window as any).messageHandler = () => {
      (window as any).handleNewMessage();
    };
    
    window.addEventListener('linkedin-new-message', (window as any).messageHandler);
  },

  /**
   * Re-setup event listener after navigation
   */
  reSetupMessageEventListener: () => {
    // Remove old listener if any
    window.removeEventListener('linkedin-new-message', (window as any).messageHandler);
    
    // Create and store new handler
    (window as any).messageHandler = () => {
      (window as any).handleNewMessage();
    };
    
    window.addEventListener('linkedin-new-message', (window as any).messageHandler);
  },

  /**
   * Starts a heartbeat that ensures the observer is alive
   * and prevents the tab from sleeping
   */
  startHeartbeat: () => {
    if ((window as any).monitoringHeartbeat) {
      clearInterval((window as any).monitoringHeartbeat);
    }

    (window as any).monitoringHeartbeat = setInterval(() => {
      console.log('💓 Monitoring Heartbeat');

      // 1. Anti-Throttling: trivial DOM manipulation to prove activity
      // This forces the browser to prioritize this tab's rendering
      const tick = document.getElementById('monitoring-tick');
      if (!tick) {
        const div = document.createElement('div');
        div.id = 'monitoring-tick';
        div.style.display = 'none';
        document.body.appendChild(div);
      } else {
        tick.innerText = Date.now().toString();
      }

      // 2. Observer Health Check
      const conversationList = document.querySelector('.msg-conversations-container__conversations-list') ||
                               document.querySelector('ul[class*="msg-conversations"]');
      
      // If the list exists but our observer is disconnected (or the list was replaced by React)
      if (conversationList && !(window as any).messageObserver) {
        console.log('⚠️ Observer missing, restarting...');
        // Call the setup function we defined previously
        // Note: You need to ensure setupMessageObserver is accessible here or call it via the exposed window function if setup that way
        window.dispatchEvent(new CustomEvent('linkedin-restart-observer'));
      }
    }, 10000); // Check every 10 seconds
  }
};
