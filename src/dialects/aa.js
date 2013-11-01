/**
 * TODO: document
 * TODO: simplify the timecode regex
 * TODO: fill missing ends on timecode sections
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
  Aa.block['timecode'] =  function timecode( block, next ) {
    var re = /^\s{0,3}(((\d{1,2})(:))?(\d\d):(\d\d)([,\.](\d{1,3}))?)\s*-->(\s*(((\d{1,2})(:))?(\d\d):(\d\d)([,\.](\d{1,3}))?))?\s*(?:\n|$)/,
      m = block.match( re );

    if ( !m )
      return undefined;

    var inner = [];
    while (next.length) {
      var found = next[0].match(re);

      if ( found ) { break; }

      inner.push(next.shift());
    }

    var begin = [ "span", {"property": "aa:begin"}, m[1] ];
    var end = [ "span", {"property": "aa:end"}, m[10] ];

    return [ [ "section", {"typeof": "aa:annotation", "data-begin": m[1], "data-end": m[10]}, begin, " \u2192 ", end, this.toTree(inner, [ "div", {"property": "aa:content"} ]) ] ];
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
   *    <a href="/SherryTurkle" rel="aa:Speaker"></a>
   */
  Aa.inline[ "[[" ] = function semanticwikilink( text ) {
    var m = text.match( /^\[\[\s*(?:((\w+):)?([^\]#]+?)\s*::)?\s*(.+?)\s*(?:\|\s*(.+?)\s*)?\]\](?!\])/ );

    var wikify = function(target) {
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
