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

  function rpad (n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
  }

  function lpad (n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
  }

  function divmod (a, b) {
    return [ Math.floor(a / b), a % b ];
  }

  function ms2tc (ms) {
    var _, ms = ms, ss, mm, hh;

    _ = divmod(ms, 1000);
    ss = _[0];
    ms = _[1];
    
    _ = divmod(ss, 3600);
    hh = _[0];
    ss = _[1];

    _ = divmod(ss, 60);
    mm = _[0];
    ss = _[1];

    ms = rpad(ms, 3);
    ss = lpad(ss, 2);
    mm = lpad(mm, 2);
    hh = lpad(hh, 2);

    return hh + ':' + mm + ':' + ss + ',' + ms;
  }

  function ss2tc (ss) {
    return ms2tc(ss * 1000);
  }

  function tc2ss (tc) {
    var pattern = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[,\.](\d+))?$/,
      match = tc.match(pattern),
      ret = NaN;

    if (match) {
      ret = match[1]
        ? parseInt(match[1], 10) * 3600
        : 0;
      ret += parseInt(match[2], 10) * 60;
      ret += parseInt(match[3], 10);
      ret += match[4]
        ? parseFloat('0.' + match[4])
        : 0;
    }

    return ret;
  }


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
      return undefined;
    }

    // if not specified, sets the end of the previous timed section with the
    // current value for begin
    var previous = this.tree[this.tree.length - 1],
      previousAttrs = previous[1];

    var dur = m[2] ? tc2ss(m[2]) : 5;

    if (!previousAttrs['data-end']) {
      begin = 0;
      end = dur;
    } else {
      begin = parseFloat(previousAttrs['data-end']);

      if ( !m[2] ) {
        end = begin + (parseFloat(previousAttrs['data-end']) - parseFloat(previousAttrs['data-begin']));
      } else {
        end = begin + dur;
      }
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
    var attrs = {"typeof": "aa:annotation", "data-begin": "" + begin};
    var section = [ "section", attrs ];
    
    section.push([ "span", {"property": "aa:begin", "content": "" + begin, "datatype": "xsd:float"}, ss2tc(begin) ]);

    // sets the end only if the group was matched
    if (end) {
      attrs["data-end"] = "" + end;
      section.push([ "span", {"property": "aa:end", "content": "" + end, "datatype": "xsd:float"}, ss2tc(end) ]);
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
    var begin = tc2ss(m[1]),
      end = m[10] ? tc2ss(m[10]) : m[10];

    // if not specified, sets the end of the previous timed section with the
    // current value for begin
    var previous = this.tree[this.tree.length - 1],
      previousAttrs = previous[1];

    if (previousAttrs['data-begin'] && !previousAttrs['data-end']) {
      previousAttrs['data-end'] = "" + begin;
      previous.splice(3, 0, [ "span", {"property": "aa:end", "content": "" + begin, "datatype": "xsd:float", "class": "deduced"}, ss2tc(begin) ]);
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
    var attrs = {"typeof": "aa:annotation", "data-begin": "" + begin};
    var section = [ "section", attrs ];
    
    section.push([ "span", {"property": "aa:begin", "content": "" + begin, "datatype": "xsd:float"}, ss2tc(begin) ]);

    // sets the end only if the group was matched
    if (end) {
      attrs["data-end"] = "" + end;
      section.push([ "span", {"property": "aa:end", "content": "" + end, "datatype": "xsd:float"}, ss2tc(end) ]);
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

  return Aa;
});
