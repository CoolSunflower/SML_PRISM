- Sentiment has now been added to Google Alerts, so all three pages for processed need to have same structure with 4 boxes in analytics: Mention distribution, sentiment distribution, top topics, classification method
- Classification method box: bar is not visible for relevancy classification
- Social Media Processed analytics are empty (raw social media analytics graph is present and populated)
- All pages need to show total mentions in the current window and also the total over all time
- The feed list needs to have header to communicate by default it is over all time
- Applying date filters, should also update graph & other analytics to display for that date range only which can be done after fetching data, this does add a little bit of logic redundancy in both backend and frontend, maybe some way to combat that by making the backend api send this data only?
- View Source option is not present, it should be present in all cards everywhere, the definition might be different for different types of data so look out for that
- Pagination shows NaN-NaN out of <Total Count Value>
- Logos for brand should be used, ex for twitter we should Twitter logo and so on
- Maybe change the to spline based curve, lets add a basic settings option menu in header on top left with light-dark selector and graph view selector
- I have shifted the logic a bit to show the View selector in the header
- Go through the codebase once again and ensure we are not doing anything sub-optimal, especially since the database is large, let us try to ensure we are not making big unnecessary queries.


- Time of post is not visible in Social media items, it is visible in Google Alerts items