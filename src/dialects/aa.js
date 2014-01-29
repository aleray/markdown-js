/**
 * TODO: document
 * TODO: simplify the timecode regex
 */
if (typeof define !== 'function') { var define = require('amdefine')(module) }
define(['../markdown_helpers', './dialect_helpers', './maruku', '../parser'], function (MarkdownHelpers, DialectHelpers, Maruku, Markdown) {

  var Aa = DialectHelpers.subclassDialect( Maruku ),
      extract_attr = MarkdownHelpers.extract_attr,
      forEach = MarkdownHelpers.forEach;

  Aa.processMetaHash = Maruku.processMetaHash;


  /**
   * Adds supports for srt-like timed sections.
   */
  Aa.block['slide'] =  function timecode( block, next ) {
    // matches expressions like "%< 00:00:05"
    var re = /^\s{0,3}8<(\s*(((\d{1,2})(:))?(\d\d):(\d\d)([,\.](\d{1,3}))?))?\s*(?:\n|$)/,
      m = block.match( re ),
      begin,
      end;

    // stops here if there is no match
    if ( !m ) { 
        return undefined 
    };

    // if not specified, sets the end of the previous timed section with the
    // current value for begin
    var previous = this.tree[this.tree.length - 1],
      previousAttrs = previous[1];

    var dur = m[2] || "00:00:05";

    if (!previousAttrs['data-end']) {
      begin = '00:00:00';
      end = dur;
    } else {
      begin = previousAttrs['data-end'];

      if ( !m[2] ) {
        end = begin.toSeconds() + (previousAttrs['data-end'].toSeconds() - previousAttrs['data-begin'].toSeconds())  
      } else {
        end = begin.toSeconds() + dur.toSeconds();
      }
      end = '0' + end.secondsTo('hh:mm:ss.ms');
    }

    // collects the content of the timed section; that is the following blocks
    // until an other timed section is found, or the end of the source text is
    // reached.
    var inner = [];

    while (next.length) {
      var found = next[0].match(re);

      if ( found ) { break; }

      inner.push(next.shift());
    }

    // constructs the JSONML to push to the tree
    var attrs = {"typeof": "aa:annotation", "data-begin": begin};
    var section = [ "section", attrs ];
    
    section.push([ "span", {"property": "aa:begin"}, begin ]);

    // sets the end only if the group was matched
    if (end) {
      attrs["data-end"] = end;
      section.push([ "span", {"property": "aa:end"}, end ]);
    }

    section.push(this.toTree(inner, [ "div", {"property": "aa:content"} ]));

    return [ section ];
  };


  /**
   * Adds supports for srt-like timed sections.
   */
  Aa.block['timecode'] =  function timecode( block, next ) {
    // matches expressions like "00:00:00 --> 00:00:10"
    var re = /^\s{0,3}(((\d{1,2})(:))?(\d\d):(\d\d)([,\.](\d{1,3}))?)\s*-->(\s*(((\d{1,2})(:))?(\d\d):(\d\d)([,\.](\d{1,3}))?))?\s*(?:\n|$)/,
      m = block.match( re );

    // stops here if there is no match
    if ( !m )
      return undefined;

    // references the begin and end groups
    var begin = m[1],
      end = m[10];

    // if not specified, sets the end of the previous timed section with the
    // current value for begin
    var previous = this.tree[this.tree.length - 1],
      previousAttrs = previous[1];

    if (previousAttrs['data-begin'] && !previousAttrs['data-end']) {
      previousAttrs['data-end'] = begin;
      previous.splice(3, 0, [ "span", {"property": "aa:end", "class": "deduced"}, begin ]);
    }

    // collects the content of the timed section; that is the following blocks
    // until an other timed section is found, or the end of the source text is
    // reached.
    var inner = [];

    while (next.length) {
      var found = next[0].match(re);

      if ( found ) { break; }

      inner.push(next.shift());
    }

    // constructs the JSONML to push to the tree
    var attrs = {"typeof": "aa:annotation", "data-begin": begin};
    var section = [ "section", attrs ];
    
    section.push([ "span", {"property": "aa:begin"}, begin ]);

    // sets the end only if the group was matched
    if (end) {
      attrs["data-end"] = end;
      section.push([ "span", {"property": "aa:end"}, end ]);
    }

    section.push(this.toTree(inner, [ "div", {"property": "aa:content"} ]));

    return [ section ];
  };


  /**
   * Adds support for semantic (wiki)links (RDFa).
   *
   * Converts links of style `[[ rel :: target | label ]]`, where `rel` and
   * `label` are optional.
   *
   * For instance:
   *
   *     [[ Speaker :: Sherry Turkle | Second Self ]]
   *
   * is rendered as:
   *
   *    <a href="Sherry_Turkle" rel="aa:Speaker">Second Self</a>
   */
  Aa.inline[ "[[" ] = function semanticwikilink( text ) {
    var m = text.match( /^\[\[\s*(?:((\w+):)?([^\]#]+?)\s*::)?\s*(.+?)\s*(?:\|\s*(.+?)\s*)?\]\](?!\])/ );

    var wikify = function(target) {
      // Links like 'sherry Turkle' will get wikified.
      // Links like 'sherry.jpeg' will not get wikified.
      // Links like /pages/sherry_Turkle will not get wikified.
      // Links like http://example.com/sherry_turkle.ogv will not get wikified
      if (target.indexOf("/") === -1 && !target.match(/.*\.(\w+)$/)) {
        var parts = target.match(/([^#]*)#*([^#]*)/);
        var path = parts[1];
        var hash = parts[2];
        var capitaliseFirstLetter = function(string) {
          return string.charAt(0).toUpperCase() + string.slice(1);
        };
        var path = capitaliseFirstLetter(path.replace(/\s+/g, '_'));
        var uri = encodeURIComponent(path);
        if (hash) {
          // do not escape =, so we can have #t=3.5
          uri += '#' + encodeURIComponent(hash).replace('%3D', '=');
        }
        return uri;
      }
      return target;
    };

    if ( m ) {
      var ns = m[2] || 'aa';
      var rel = m[3];
      var target = m[4];
      var label = m[5];
      var attrs = {};

      if (rel) {
        attrs['rel'] = ns + ':' + rel;
      }

      attrs['href'] = wikify(target);

      return [ m[0].length, [ "link", attrs, label || target ] ];
    }

    // Just consume the '[['
    return [ 2, "[[" ];
  };


  /**
   * Adds support for semantic data (RDFa).
   *
   * Converts structures like `%% property :: content | label %%` into span
   * elements with a property and content attributes. label is optional
   *
   * For instance, the following text:
   *
   *    %%dc:author :: Sherry Turkle | Turkle's%% %%dc:title::Second Self%% was
   *    an early book on the social aspects of computation.
   *
   * is rendered as:
   *
   *    <p><span content="Sherry Turkle" property="dc:author">Turkle's</span>
   *    <span content="Second Self" property="dc:title">Second Self</span> was
   *    an early book on the social aspects of computation.</p>
   */
  Aa.inline[ "%%" ] = function semanticdata( text ) {
    var m = text.match( /^\%\%\s*(?:((\w+):)?([^\%#]+?)\s*::)?\s*(.+?)\s*(?:\|\s*([^\]]+?)\s*)?\%\%(?!\%)/ );

    if ( m ) {
      var ns = m[2] || 'aa';
      var property = m[3];
      var value = m[4];
      var label = m[5];
      var attrs = {};

      if (property) {
        attrs['property'] = ns + ':' + property;

        if (value !== label) {
          attrs['value'] = value;
        }
      }

      return [ m[0].length, [ "span", attrs, label || value ] ];
    }

    // Just consume the '[['
    return [ 2, "%%" ];
  };


  Markdown.dialects.Aa = Aa;
  Markdown.buildBlockOrder ( Markdown.dialects.Aa.block );
  Markdown.buildInlinePatterns( Markdown.dialects.Aa.inline );



/**
 * $media jQuery plugin (v.2.1.1)
 *
 * 2012. Created by Oscar Otero (http://oscarotero.com / http://anavallasuiza.com)
 *
 * $media is released under the GNU Affero GPL version 3.
 * More information at http://www.gnu.org/licenses/agpl-3.0.html
 */

/**
 * Extends the String object to convert any number to seconds
 *
 * '00:34'.toSeconds(); // 34
 *
 * @return float The value in seconds
 */
String.prototype.toSeconds = function () {
    'use strict';

    var time = this, ms;

    if (/^([0-9]{1,2}:)?[0-9]{1,2}:[0-9]{1,2}(\.[0-9]+)?(,[0-9]+)?$/.test(time)) {
        time = time.split(':', 3);

        if (time.length === 3) {
            ms = time[2].split(',', 2);
            ms[1] = ms[1] || 0;

            return ((((parseInt(time[0], 10) * 3600) + (parseInt(time[1], 10) * 60) + parseFloat(ms[0])) * 1000) + parseInt(ms[1], 10)) / 1000;
        }

        ms = time[1].split(',', 1);
        ms[1] = ms[1] || 0;

        return ((((parseInt(time[0], 10) * 60) + parseFloat(ms[0])) * 1000) + parseInt(ms[1], 10)) / 1000;
    }

    return parseFloat(time).toSeconds();
};



/**
 * Extends the String object to convert any number value to seconds
 *
 * '34'.secondsTo('mm:ss'); // '00:34'
 *
 * @param string outputFormat One of the avaliable output formats ('ms', 'ss', 'mm:ss', 'hh:mm:ss', 'hh:mm:ss.ms')
 *
 * @return string The value in the new format
 */
String.prototype.secondsTo = function (outputFormat) {
    'use strict';

    return this.toSeconds().secondsTo(outputFormat);
};



/**
 * Extends the Number object to convert any number to seconds
 *
 * (23.34345).toSeconds(); // 23.343
 *
 * @return float The value in seconds
 */
Number.prototype.toSeconds = function () {
    'use strict';

    return Math.floor(this * 1000) / 1000;
};


/**
 * Extends the Number object to convert any number value to seconds
 *
 * 34.secondsTo('mm:ss'); // '00:34'
 *
 * @param string outputFormat One of the avaliable output formats ('ms', 'ss', 'mm:ss', 'hh:mm:ss', 'hh:mm:ss.ms')
 *
 * @return string The value in the new format
 */
Number.prototype.secondsTo = function (outputFormat) {
    'use strict';

    var time = this;

    switch (outputFormat) {
        case 'ms':
            return Math.floor(time * 1000);

        case 'ss':
            return Math.floor(time);

        case 'mm:ss':
        case 'hh:mm:ss':
        case 'hh:mm:ss.ms':
            var hh = '';

            if (outputFormat !== 'mm:ss') {
                hh = Math.floor(time / 3600);
                time = time - (hh * 3600);
                hh += ':';
            }

            var mm = Math.floor(time / 60);
            time = time - (mm * 60);
            mm = (mm < 10) ? ("0" + mm) : mm;
            mm += ':';

            var ss = time;

            if (outputFormat.indexOf('.ms') === -1) {
                ss = Math.floor(ss);
            } else {
                ss = Math.floor(ss*1000)/1000;
            }
            ss = (ss < 10) ? ("0" + ss) : ss;

            return hh + mm + ss;
    }

    return time;
};

  return Aa;
});
