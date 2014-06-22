/**
 * TODO: document
 * TODO: simplify the timecode regex
 */
if (typeof define !== 'function') { var define = require('amdefine')(module) }
define(['../markdown_helpers', './dialect_helpers', '../parser', './aa'], function (MarkdownHelpers, DialectHelpers, Markdown, Aa) {

  var AaTiny = {
    block: {
    },
    inline: {
    }
  };

  var tc2ss = Aa.utils.tc2ss;
  var ss2tc = Aa.utils.ss2tc;

  /**
   * Adds supports for srt-like timed sections.
   */
  AaTiny.block['slide'] =  function timecode( block, next ) {
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
  AaTiny.block['timecode'] =  function timecode( block, next ) {
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
    var found;

    while (next.length) {
      found = next[0].match(re);

      if ( found ) { break; }

      inner.push(next.shift());
    }

    // constructs the JSONML to push to the tree
    var attrs = {"typeof": "aa:annotation", "data-begin": "" + begin};
    var section = [ "section", attrs, inner ];
    
    // sets the end only if the group was matched
    if (end) {
      // sets the end if the group was matched
      attrs["data-end"] = "" + end;
    } else if (!found) {
      // if there is no subsequent timed section, and the end time has not been
      // set, it inherits from the begin time
      end = begin;
      attrs["data-end"] = "" + end;
    }

    return [ section ];
  };


  /**
   *  toSRT( markdown ) -> String
   *  - markdown (String): markdown string to parse
   *
   *  Takes markdown (as a string) and turns it into Subrip.
   **/
  AaTiny.toSRT = function toHTML( source ) {
    var tree = Markdown.parse(source, "AaTiny");
    var nodes = tree.splice(1);

    var output = "";

    for (var i = 0, l = nodes.length; i < l; i ++) {
      var leaf = nodes[i];

      output += (i + 1) + "\n";
      output += leaf[1]["data-begin"] + " --> " + leaf[1]["data-end"] + "\n";
      for (var j = 0, m = leaf[2].length; j < m; j ++) {
        output += leaf[2][j] + "\n\n";
      }
    }

    return output;
  };


  /**
   *  toAudacity( markdown ) -> String
   *  - markdown (String): markdown string to parse
   *
   *  Takes markdown (as a string) and turns it into Audacity markers.
   **/
  AaTiny.toAudacity = function toHTML( source ) {
    var tree = Markdown.parse(source, "AaTiny");
    var nodes = tree.splice(1);

    var output = "";

    for (var i = 0, l = nodes.length; i < l; i ++) {
      var leaf = nodes[i];

      output += leaf[1]["data-begin"] + "\t" + leaf[1]["data-end"] + "\t";

      for (var j = 0, m = leaf[2].length; j < m; j ++) {
        leaf[2][j] = leaf[2][j].replace('\n', '\\n');
      }

      output += leaf[2].join('\\n\\n');

      output += "\n";
    }

    return output;
  };


  Markdown.dialects.AaTiny = AaTiny;
  Markdown.buildBlockOrder ( Markdown.dialects.AaTiny.block );

  return AaTiny;
});
