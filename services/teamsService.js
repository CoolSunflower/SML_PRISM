const axios = require('axios');

async function sendTeamsAlert(item, classification) {
  try {
    await axios.post(process.env.TEAMS_WEBHOOK_URL, {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: "FF0000",
      summary: "Competitor Death Alert",
      title: "Competitor Death Related Event",
      sections: [
        {
          facts: [
            {
              name: "Topic",
              value: classification.topic
            },
            {
              name: "Subtopic",
              value: classification.subTopic
            },
            {
              name: "Platform",
              value: item.platform
            }
          ],
          text: `
**Content:**  
${item.content}

${item.title || 'N/A'}

**Link:** ${item.link || 'N/A'}
`
        }
      ]
    });

    console.log('[Teams] Alert sent');
  } catch (err) {
    console.error(
      '[Teams] Alert failed:',
      err.response?.data || err.message
    );
  }
}

module.exports = {
  sendTeamsAlert,
};