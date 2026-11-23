// Starter food list. Values per 100 g (approximate, from USDA / CIQUAL averages).
// Format: name | kcal | protein | carbs | fat | serving grams | serving label
const RAW = `
Chicken breast, raw|120|22.5|0|2.6|150|1 breast
Chicken breast, cooked|165|31|0|3.6|120|1 breast
Chicken thigh, cooked|209|26|0|10.9|100|1 thigh
Turkey breast, cooked|135|30|0|1|
Beef steak, lean, cooked|217|30|0|10|180|1 steak
Ground beef 5% fat, raw|137|21|0|5|
Ground beef 15% fat, raw|215|18.6|0|15|
Ground beef 15% fat, cooked|250|26|0|15|
Pork tenderloin, cooked|143|26|0|3.5|
Pork chop, cooked|231|26|0|14|
Bacon, cooked|541|37|1.4|42|10|1 slice
Ham, cooked slices|115|19|1|3.5|30|1 slice
Salami|407|22|1.5|35|10|1 slice
Lamb, cooked|258|25.5|0|16.5|
Duck breast, cooked|201|23.5|0|11|
Salmon, raw|208|20|0|13|125|1 fillet
Salmon, cooked|206|22|0|12|125|1 fillet
Smoked salmon|117|18|0|4.3|50|2 slices
Tuna, canned in water|116|26|0|1|
Tuna, canned in oil, drained|198|29|0|8|
Cod, cooked|105|23|0|0.9|
Shrimp, cooked|99|24|0.2|0.3|
Sardines, canned in oil|208|25|0|11.5|
Mackerel, cooked|262|24|0|18|
Tilapia, cooked|128|26|0|2.7|
Egg, whole|143|12.6|0.7|9.5|50|1 egg
Egg white|52|10.9|0.7|0.2|33|1 white
Tofu, firm|144|15.8|2.8|8.7|
Tempeh|192|20|7.6|10.8|
Seitan|370|75|14|1.9|
Whey protein powder|380|78|7|5|30|1 scoop
Casein protein powder|360|80|4|1.5|30|1 scoop
Vegan protein powder|380|75|8|6|30|1 scoop
Milk, whole|61|3.2|4.8|3.3|250|1 glass
Milk, semi-skimmed|46|3.4|4.8|1.6|250|1 glass
Milk, skimmed|34|3.4|5|0.1|250|1 glass
Oat drink|45|1|6.6|1.5|250|1 glass
Soy drink|39|3.3|0.7|1.8|250|1 glass
Almond drink, unsweetened|15|0.5|0.3|1.1|250|1 glass
Greek yogurt 0%|59|10.3|3.6|0.4|150|1 pot
Greek yogurt full fat|97|9|3.9|5|150|1 pot
Plain yogurt|61|3.5|4.7|3.3|125|1 pot
Skyr|63|11|4|0.2|150|1 pot
Fromage blanc 0%|46|7.5|4|0.2|100|
Cottage cheese|98|11|3.4|4.3|
Mozzarella|280|22|2.2|20|125|1 ball
Cheddar|403|25|1.3|33|30|1 slice
Emmental|380|28|0|30|30|1 slice
Comté|410|27|0|34|30|
Parmesan|392|35.8|3.2|25.8|10|1 tbsp grated
Feta|264|14|4|21|
Camembert|300|20|0.5|24|30|1 portion
Goat cheese|364|21.6|0.1|29.8|
Cream cheese|342|6|4|34|
Butter|717|0.9|0.1|81|10|1 pat
Heavy cream 30%|292|2.1|3|30|
Sour cream|198|2.4|4.6|19|
Rice, white, raw|360|7|79|0.6|75|1 portion dry
Rice, white, cooked|130|2.7|28|0.3|200|1 portion
Rice, brown, cooked|123|2.7|25.6|1|200|1 portion
Basmati rice, cooked|121|3.5|25|0.4|200|1 portion
Pasta, dry|359|12.5|72|1.5|80|1 portion dry
Pasta, cooked|158|5.8|31|0.9|200|1 portion
Whole wheat pasta, cooked|149|6|30|1.7|200|1 portion
Couscous, cooked|112|3.8|23|0.2|
Quinoa, cooked|120|4.4|21.3|1.9|
Bulgur, cooked|83|3.1|18.6|0.2|
Oats, rolled|379|13.2|67.7|6.5|50|1 bowl
Granola|471|10|64|20|50|
Muesli, no added sugar|362|10|66|6|50|
Cornflakes|357|7.5|84|0.4|30|1 bowl
Bread, white|265|9|49|3.2|30|1 slice
Bread, whole wheat|247|13|41|3.4|35|1 slice
Baguette|270|9|55|1.2|60|1/4 baguette
Sourdough bread|250|9|48|1.5|50|1 slice
Rye bread|259|8.5|48|3.3|35|1 slice
Croissant|406|8.2|45.8|21|60|1 croissant
Pain au chocolat|414|7.5|46|22|65|1 piece
Bagel|257|10|50|1.5|90|1 bagel
Tortilla wrap, wheat|310|8|52|7.5|60|1 wrap
Rice cakes|387|8|82|3|9|1 cake
Crackers|440|9|70|14|
Potato, boiled|87|1.9|20|0.1|150|1 medium
Potato, baked|93|2.5|21|0.1|170|1 medium
Sweet potato, baked|90|2|20.7|0.2|150|1 medium
French fries|312|3.4|41|15|120|1 portion
Mashed potatoes|106|1.9|15|4.2|
Lentils, cooked|116|9|20|0.4|
Chickpeas, cooked|164|8.9|27.4|2.6|
Kidney beans, cooked|127|8.7|22.8|0.5|
Black beans, cooked|132|8.9|23.7|0.5|
Green peas|81|5.4|14.5|0.4|
Edamame|121|11.9|8.9|5.2|
Hummus|166|7.9|14.3|9.6|30|2 tbsp
Broccoli|34|2.8|6.6|0.4|
Spinach|23|2.9|3.6|0.4|
Green beans|31|1.8|7|0.2|
Carrot|41|0.9|9.6|0.2|60|1 carrot
Tomato|18|0.9|3.9|0.2|120|1 tomato
Cherry tomatoes|18|0.9|3.9|0.2|
Cucumber|15|0.7|3.6|0.1|
Lettuce|15|1.4|2.9|0.2|
Mixed salad leaves|17|1.5|2.5|0.2|
Bell pepper|31|1|6|0.3|150|1 pepper
Onion|40|1.1|9.3|0.1|110|1 onion
Garlic|149|6.4|33|0.5|3|1 clove
Zucchini|17|1.2|3.1|0.3|
Eggplant|25|1|5.9|0.2|
Mushrooms|22|3.1|3.3|0.3|
Cauliflower|25|1.9|5|0.3|
Brussels sprouts|43|3.4|9|0.3|
Asparagus|20|2.2|3.9|0.1|
Corn, canned|86|3.3|19|1.2|
Avocado|160|2|8.5|14.7|150|1 avocado
Beetroot, cooked|44|1.7|10|0.2|
Kale|49|4.3|8.8|0.9|
Apple|52|0.3|13.8|0.2|180|1 apple
Banana|89|1.1|22.8|0.3|120|1 banana
Orange|47|0.9|11.8|0.1|150|1 orange
Pear|57|0.4|15|0.1|170|1 pear
Strawberries|32|0.7|7.7|0.3|
Blueberries|57|0.7|14.5|0.3|
Raspberries|52|1.2|11.9|0.7|
Grapes|69|0.7|18|0.2|
Kiwi|61|1.1|14.7|0.5|75|1 kiwi
Mango|60|0.8|15|0.4|
Pineapple|50|0.5|13.1|0.1|
Watermelon|30|0.6|7.6|0.2|
Melon|34|0.8|8.2|0.2|
Peach|39|0.9|9.5|0.3|150|1 peach
Cherries|63|1.1|16|0.2|
Dates, dried|282|2.5|75|0.4|8|1 date
Raisins|299|3.1|79|0.5|
Dried apricots|241|3.4|63|0.5|
Lemon juice|22|0.4|6.9|0.2|
Orange juice|45|0.7|10.4|0.2|250|1 glass
Apple juice|46|0.1|11.3|0.1|250|1 glass
Almonds|579|21|21.6|49.9|30|1 handful
Walnuts|654|15.2|13.7|65.2|30|1 handful
Cashews|553|18|30|44|30|1 handful
Peanuts|567|25.8|16|49|30|1 handful
Hazelnuts|628|15|16.7|60.8|30|1 handful
Pistachios|560|20|27.5|45|30|1 handful
Peanut butter|588|25|20|50|15|1 tbsp
Almond butter|614|21|19|55.5|15|1 tbsp
Chia seeds|486|16.5|42|30.7|15|1 tbsp
Flax seeds|534|18.3|28.9|42.2|10|1 tbsp
Sunflower seeds|584|20.8|20|51.5|
Pumpkin seeds|559|30|10.7|49|
Olive oil|884|0|0|100|10|1 tbsp
Vegetable oil|884|0|0|100|10|1 tbsp
Coconut oil|862|0|0|100|10|1 tbsp
Mayonnaise|680|1|0.6|75|15|1 tbsp
Ketchup|112|1.2|26|0.1|15|1 tbsp
Mustard|66|4.4|5.8|3.3|5|1 tsp
Soy sauce|53|8|4.9|0.6|15|1 tbsp
Pesto|450|5|6|45|
Tomato sauce|29|1.3|5|0.3|
Vinaigrette|450|0|8|47|15|1 tbsp
Honey|304|0.3|82|0|20|1 tbsp
Maple syrup|260|0|67|0.1|20|1 tbsp
Sugar|400|0|100|0|5|1 tsp
Jam|250|0.4|62|0.1|20|1 tbsp
Nutella|539|6.3|57.5|30.9|15|1 tbsp
Dark chocolate 70%|598|7.8|46|42.6|20|2 squares
Milk chocolate|535|7.7|59.4|29.7|20|2 squares
Protein bar|370|33|35|12|60|1 bar
Cereal bar|400|5|70|12|25|1 bar
Cookies|488|5.5|68|22|10|1 cookie
Ice cream, vanilla|207|3.5|23.6|11|65|1 scoop
Potato chips|536|7|53|35|30|1 small bag
Popcorn, plain|387|13|78|4.5|
Pizza margherita|250|10|30|9.5|350|1 pizza
Hamburger|254|13|30|9|110|1 burger
Lasagna|135|8|12|6|
Sushi, salmon maki|150|6|28|1.5|25|1 piece
Coffee, black|1|0.1|0|0|250|1 cup
Espresso|9|0.1|1.7|0.2|30|1 shot
Cappuccino|42|2.2|4|1.8|250|1 cup
Tea, unsweetened|1|0|0.2|0|250|1 cup
Coca-Cola|42|0|10.6|0|330|1 can
Coca-Cola Zero|0.3|0|0|0|330|1 can
Beer|43|0.5|3.6|0|330|1 bottle
Red wine|85|0.1|2.6|0|150|1 glass
White wine|82|0.1|2.6|0|150|1 glass
Sports drink|26|0|6.4|0|500|1 bottle
Energy drink|45|0|11|0|250|1 can
`;

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const STARTER_FOODS = RAW.trim()
  .split('\n')
  .map((line) => {
    const [name, kcal, p, c, f, sg, sl] = line.split('|');
    return {
      id: 'sf-' + slug(name),
      name,
      kcal: +kcal,
      p: +p,
      c: +c,
      f: +f,
      serving: sg ? +sg : null,
      servingLabel: sl || '',
      source: 'starter',
    };
  })
  .filter((f, i, arr) => arr.findIndex((g) => g.id === f.id) === i);
